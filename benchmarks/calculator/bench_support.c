/* Shared observer/entry point for both executables. No logging in timed loops. */
#include "bench_support.h"
#include "tom_runtime.h"
#include <SDL3/SDL.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <inttypes.h>
#include <errno.h>
#ifdef _WIN32
#include <windows.h>
#include <psapi.h>
#else
#include <sys/resource.h>
#endif

/* Count tracked Tom objects without changing production runtime sources/ABI.
 * These are not malloc counts: SDL and internal libmpdec allocations are excluded. */
#define tom_object_acquired bench_original_object_acquired
#include "../../tom-lang/runtime/stable/common.c"
#undef tom_object_acquired
static uint64_t acquisitions, acquired_at_start, acquired_at_stop;
void tom_object_acquired(void) { acquisitions++; bench_original_object_acquired(); }

BenchEvent *bench_events;
size_t bench_event_count, bench_cursor, bench_warmup, bench_cycles;
int bench_verify, bench_active, bench_done;
uint32_t bench_idle_ms;
static uint64_t begin_tick, end_tick, entry_tick, first_tick, frames;
static double begin_cpu, end_cpu;
static uint64_t digest = UINT64_C(14695981039346656037);
typedef struct { char display[128], message[256]; uint64_t drawing_hash; } Frame;
static Frame *recorded;
static size_t recorded_count, recorded_capacity;

void bench_fail(const char *message) { fprintf(stderr, "benchmark: %s\n", message); exit(2); }
static double cpu_ms(void) {
#ifdef _WIN32
    FILETIME created, exited, kernel, user;
    if (!GetProcessTimes(GetCurrentProcess(), &created, &exited, &kernel, &user)) bench_fail("GetProcessTimes");
    uint64_t k = ((uint64_t)kernel.dwHighDateTime << 32) | kernel.dwLowDateTime;
    uint64_t u = ((uint64_t)user.dwHighDateTime << 32) | user.dwLowDateTime;
    return (double)(k + u) / 10000.0;
#else
    struct rusage r;
    if (getrusage(RUSAGE_SELF, &r)) bench_fail("getrusage");
    return 1000.0 * (double)(r.ru_utime.tv_sec + r.ru_stime.tv_sec)
        + (double)(r.ru_utime.tv_usec + r.ru_stime.tv_usec) / 1000.0;
#endif
}
static uint64_t peak_resident_bytes(void) {
#ifdef _WIN32
    PROCESS_MEMORY_COUNTERS r;
    if (!GetProcessMemoryInfo(GetCurrentProcess(), &r, sizeof(r))) bench_fail("GetProcessMemoryInfo");
    return (uint64_t)r.PeakWorkingSetSize;
#else
    struct rusage r;
    if (getrusage(RUSAGE_SELF, &r)) bench_fail("getrusage");
    return (uint64_t)r.ru_maxrss * 1024;
#endif
}
void bench_start(void) {
    if (bench_active || bench_done) bench_fail("invalid start boundary");
    frames = 0; digest = UINT64_C(14695981039346656037);
    acquired_at_start = acquisitions;
    begin_cpu = cpu_ms(); begin_tick = SDL_GetPerformanceCounter(); bench_active = 1;
}
void bench_stop(void) {
    if (!bench_active) bench_fail("invalid stop boundary");
    end_tick = SDL_GetPerformanceCounter(); end_cpu = cpu_ms();
    acquired_at_stop = acquisitions; bench_active = 0; bench_done = 1;
}
static void hash_text(const char *s) {
    do { digest ^= (unsigned char)*s; digest *= UINT64_C(1099511628211); } while (*s++);
}
void bench_frame(const char *display, const char *message, uint64_t drawing_hash) {
    if (!first_tick) first_tick = SDL_GetPerformanceCounter();
    if (bench_active) { frames++; hash_text(display); hash_text(message); }
    if (bench_verify) {
        if (recorded_count == recorded_capacity) bench_fail("frame buffer full");
        Frame *f = &recorded[recorded_count++];
        if (strlen(display) >= sizeof(f->display) || strlen(message) >= sizeof(f->message)) bench_fail("observer overflow");
        strcpy(f->display, display); strcpy(f->message, message); f->drawing_hash = drawing_hash;
    }
}
static size_t number(const char *s, size_t minimum, size_t maximum) {
    if (!*s) bench_fail("missing integer");
    for (const char *p = s; *p; p++) if (*p < '0' || *p > '9') bench_fail("invalid integer");
    errno = 0; char *end; unsigned long long n = strtoull(s, &end, 10);
    if (errno || *end || n < minimum || n > maximum) bench_fail("integer out of range");
    return (size_t)n;
}
static void read_events(const char *file) {
    FILE *input = fopen(file, "rb");
    if (!input) bench_fail("could not open event fixture");
    char line[1024]; size_t capacity = 0;
    while (fgets(line, sizeof(line), input)) {
        size_t length = strcspn(line, "\r\n");
        if (length == sizeof(line) - 1) bench_fail("event line too long");
        line[length] = 0;
        if (!length || line[0] == '#') continue;
        if (bench_event_count == capacity) {
            capacity = capacity ? capacity * 2 : 64;
            if (capacity > 100000) bench_fail("too many events");
            void *next = realloc(bench_events, capacity * sizeof(*bench_events));
            if (!next) bench_fail("allocation failed");
            bench_events = next;
        }
        BenchEvent e = {0}; int consumed = 0;
        if (!strncmp(line, "text ", 5)) {
            if (strlen(line + 5) >= sizeof(e.text) || !tom_utf8_valid(line + 5)) bench_fail("invalid event text");
            e.kind = 2; strcpy(e.text, line + 5);
        } else if (sscanf(line, "key %d%n", &e.key, &consumed) == 1 && !line[consumed]) e.kind = 3;
        else if (sscanf(line, "mouse %d %d %d%n", &e.x, &e.y, &e.button, &consumed) == 3 && !line[consumed]) e.kind = 4;
        else if (sscanf(line, "resize %d %d%n", &e.width, &e.height, &consumed) == 2 && !line[consumed]) {
            if (e.width < 1 || e.height < 1 || e.width > 4096 || e.height > 4096) bench_fail("invalid size");
            e.kind = 5;
        } else if (!strcmp(line, "expose")) e.kind = 6;
        else bench_fail("unrecognized fixture event");
        bench_events[bench_event_count++] = e;
    }
    if (ferror(input)) bench_fail("fixture read failed");
    fclose(input);
    if (!bench_event_count) bench_fail("empty event fixture");
}
static void json_string(const char *s) {
    putchar('"');
    for (; *s; s++) {
        unsigned char c = (unsigned char)*s;
        if (c == '"' || c == '\\') { putchar('\\'); putchar(c); }
        else if (c < 32) printf("\\u%04x", c);
        else putchar(c);
    }
    putchar('"');
}
extern int tom_bench_program_main(void);
int main(int argc, char **argv) {
    if (argc == 3 && !strcmp(argv[1], "--idle")) bench_idle_ms = (uint32_t)number(argv[2], 50, 60000);
    else {
        if (argc != 5) bench_fail("usage: binary EVENTS CYCLES WARMUP VERIFY or --idle MS");
        bench_cycles = number(argv[2], 1, 100000); bench_warmup = number(argv[3], 0, 100);
        bench_verify = (int)number(argv[4], 0, 1); read_events(argv[1]);
        if (bench_verify) {
            recorded_capacity = (bench_cycles + bench_warmup) * bench_event_count + 1;
            if (recorded_capacity > 100000) bench_fail("verification too large");
            recorded = calloc(recorded_capacity, sizeof(*recorded));
            if (!recorded) bench_fail("allocation failed");
        }
    }
    entry_tick = SDL_GetPerformanceCounter();
    int status = tom_bench_program_main();
    if (status || !bench_done || !first_tick || tom_live_objects()) bench_fail("application failed, leaked objects or missed measurement boundary");
    double tick_ms = 1000.0 / (double)SDL_GetPerformanceFrequency();
    printf("{\"schema\":1,\"elapsed_ms\":%.6f,\"cpu_ms\":%.6f,\"first_frame_ms\":%.6f,",
        (double)(end_tick - begin_tick) * tick_ms, end_cpu - begin_cpu, (double)(first_tick - entry_tick) * tick_ms);
    printf("\"events\":%zu,\"frames\":%" PRIu64 ",\"checksum\":\"%016" PRIx64 "\",",
        bench_cycles * bench_event_count, frames, digest);
    printf("\"tracked_acquisitions\":%" PRIu64 ",\"peak_tracked_objects\":%" PRId64 ",\"live_objects_at_exit\":%" PRId64 ",\"peak_resident_bytes\":%" PRIu64,
        acquired_at_stop - acquired_at_start, tom_peak_objects(), tom_live_objects(), peak_resident_bytes());
    if (bench_verify) {
        fputs(",\"observations\":[", stdout);
        for (size_t i = 0; i < recorded_count; i++) {
            if (i) putchar(',');
            fputs("{\"display\":", stdout); json_string(recorded[i].display);
            fputs(",\"message\":", stdout); json_string(recorded[i].message);
            printf(",\"drawing_hash\":\"%016" PRIx64 "\"}", recorded[i].drawing_hash);
        }
        putchar(']');
    }
    puts("}"); free(recorded); free(bench_events);
    return 0;
}
