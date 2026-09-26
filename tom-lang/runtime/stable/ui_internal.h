#ifndef TOM_UI_INTERNAL_H
#define TOM_UI_INTERNAL_H
#include "tom_runtime.h"
#define SDL_MAIN_HANDLED
#include <SDL3/SDL.h>
#include <SDL3_ttf/SDL_ttf.h>
struct TomWindow { SDL_Window *window; SDL_Renderer *renderer; int editor_count; TomEditor *editor_focus; int extended, pointer_events, wheel_events, references, closed; uint32_t buttons; Uint8 held[SDL_SCANCODE_COUNT]; struct TomWindow *next; };
struct TomFont { TTF_Font *font; };
struct TomEvent { int32_t kind, x, y, button, key, width, height, window_id, repeat, scancode, modifiers, buttons; int64_t timestamp; double precise_x, precise_y, wheel_x, wheel_y; char text[256]; TomText *dynamic_text; int32_t composition_start,composition_length,clicks; };
int tom_ui_on_main(void);
void tom_ui_window_retain(TomWindow *window);
void tom_ui_window_release(TomWindow *window);
const char *tom_ui_event_text(const TomEvent *event);
#endif
