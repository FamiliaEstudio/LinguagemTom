/* Include the production implementation, renaming only observed entry points.
 * The adapter is linked only into benchmark binaries; desktop builds use ui.c. */
#include "tom_runtime.h"
#include "bench_support.h"
#define tom_event_wait bench_sdl_event_wait
#define tom_draw_text bench_sdl_draw_text
#define tom_draw_rect bench_sdl_draw_rect
#define tom_window_clear bench_sdl_window_clear
#define tom_window_present bench_sdl_window_present
#define tom_window_new bench_sdl_window_new
#include "../../tom-lang/runtime/stable/ui.c"
#undef tom_event_wait
#undef tom_draw_text
#undef tom_draw_rect
#undef tom_window_clear
#undef tom_window_present
#undef tom_window_new

static char display_text[128], message_text[256];
static uint64_t drawing_hash = UINT64_C(14695981039346656037);
static void hash_bytes(const void *value, size_t length) {
    const unsigned char *p = value;
    for (size_t i = 0; i < length; i++) { drawing_hash ^= p[i]; drawing_hash *= UINT64_C(1099511628211); }
}
static void hash_draw(int kind, int32_t x, int32_t y, int32_t width, int32_t height, uint32_t rgba, const char *text) {
    if (!bench_verify) return;
    int64_t values[] = {kind, x, y, width, height, rgba};
    hash_bytes(values, sizeof(values));
    if (text) hash_bytes(text, strlen(text) + 1);
}
int32_t tom_window_new(const char *title, int32_t width, int32_t height, TomWindow **out) {
    int32_t status = bench_sdl_window_new(title, width, height, out);
    if (!status) SDL_SetRenderVSync((*out)->renderer, 0);
    return status;
}
static Uint32 SDLCALL finish_idle(void *unused, SDL_TimerID timer, Uint32 interval) {
    (void)unused; (void)timer; (void)interval;
    SDL_Event e; SDL_zero(e); e.type = SDL_EVENT_QUIT; SDL_PushEvent(&e); return 0;
}
int32_t tom_event_wait(TomWindow *window, TomEvent *out) {
    if (bench_idle_ms) {
        if (!bench_active && !bench_done) {
            SDL_Event e; SDL_PumpEvents(); while (SDL_PollEvent(&e)) {}
            if (!SDL_AddTimer(bench_idle_ms, finish_idle, NULL)) return TOM_RESOURCE;
            bench_start();
        }
        int32_t status = bench_sdl_event_wait(window, out);
        if (!status && out->kind == 1) bench_stop();
        return status;
    }
    if (bench_cursor == bench_warmup * bench_event_count && !bench_active) bench_start();
    memset(out, 0, sizeof(*out));
    if (bench_cursor == (bench_warmup + bench_cycles) * bench_event_count) {
        bench_stop(); out->kind = 1; return TOM_OK;
    }
    const BenchEvent *e = &bench_events[bench_cursor++ % bench_event_count];
    out->kind = e->kind; out->key = e->key; out->button = e->button;
    strcpy(out->text, e->text);
    if (e->kind == 4) return coordinates(window, (float)e->x, (float)e->y, out);
    if (e->kind == 5) {
        out->width = e->width; out->height = e->height;
        if (!SDL_SetWindowSize(window->window, e->width, e->height)) return TOM_RESOURCE;
        SDL_PumpEvents();
    }
    return TOM_OK;
}
int32_t tom_window_clear(TomWindow *window, uint32_t rgba) {
    hash_draw(1, 0, 0, 0, 0, rgba, NULL);
    return bench_sdl_window_clear(window, rgba);
}
int32_t tom_draw_rect(TomWindow *window, int32_t x, int32_t y, int32_t width, int32_t height, uint32_t rgba) {
    hash_draw(2, x, y, width, height, rgba, NULL);
    return bench_sdl_draw_rect(window, x, y, width, height, rgba);
}
int32_t tom_draw_text(TomWindow *window, TomFont *font, const char *text, int32_t x, int32_t y, uint32_t rgba) {
    if (x == 36 && y == 86) {
        if (strlen(text) >= sizeof(display_text)) return TOM_CAPACITY;
        strcpy(display_text, text);
    }
    if (x == 24 && y == 176) {
        if (strlen(text) >= sizeof(message_text)) return TOM_CAPACITY;
        strcpy(message_text, text);
    }
    hash_draw(3, x, y, bench_verify ? (int32_t)TTF_GetFontSize(font->font) : 0, 0, rgba, text);
#ifdef TOM_BENCH_HEADLESS
    (void)window; return TOM_OK;
#else
    return bench_sdl_draw_text(window, font, text, x, y, rgba);
#endif
}
int32_t tom_window_present(TomWindow *window) {
#ifdef TOM_BENCH_HEADLESS
    (void)window; int32_t status = TOM_OK;
#else
    int32_t status = bench_sdl_window_present(window);
#endif
    if (!status) bench_frame(display_text, message_text, drawing_hash);
    drawing_hash = UINT64_C(14695981039346656037);
    return status;
}
