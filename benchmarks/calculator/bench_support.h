#ifndef TOM_CALCULATOR_BENCH_SUPPORT_H
#define TOM_CALCULATOR_BENCH_SUPPORT_H
#include <stdint.h>
#include <stddef.h>
typedef struct {
    int kind, x, y, key, button, width, height;
    char text[256];
} BenchEvent;
extern BenchEvent *bench_events;
extern size_t bench_event_count, bench_cursor, bench_warmup, bench_cycles;
extern int bench_verify, bench_active, bench_done;
extern uint32_t bench_idle_ms;
void bench_start(void);
void bench_stop(void);
void bench_frame(const char *display, const char *message, uint64_t drawing_hash);
void bench_fail(const char *message);
#endif
