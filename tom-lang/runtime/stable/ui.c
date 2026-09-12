#include "tom_runtime.h"
#define SDL_MAIN_HANDLED
#include <SDL3/SDL.h>
#include <SDL3/SDL_main.h>
#include <SDL3_ttf/SDL_ttf.h>
#include <stdlib.h>
#include <string.h>
#include <stdio.h>
#include <math.h>
struct TomWindow { SDL_Window *window; SDL_Renderer *renderer; };
struct TomFont { TTF_Font *font; };
struct TomEvent { int32_t kind, x, y, button, key, width, height, window_id, repeat; char text[256]; };
static int initialized, objects;
static SDL_ThreadID main_thread;
#ifdef TOM_UI_TEST
static FILE *events, *trace;
static int scripted;
#endif
static int32_t initialize(void) {
  if (initialized) return SDL_GetCurrentThreadID() == main_thread ? TOM_OK : TOM_RESOURCE;
  SDL_SetMainReady();
  if (!SDL_Init(SDL_INIT_VIDEO)) return TOM_RESOURCE;
  if (!TTF_Init()) { SDL_Quit(); return TOM_RESOURCE; }
  main_thread = SDL_GetCurrentThreadID(); initialized = 1;
#ifdef TOM_UI_TEST
  const char *input = getenv("TOM_UI_EVENTS"), *output = getenv("TOM_UI_TRACE");
  if (input) { events = fopen(input, "rb"); scripted = 1; }
  if (output) trace = fopen(output, "wb");
#endif
  return TOM_OK;
}
static int on_main(void) { return initialized && SDL_GetCurrentThreadID() == main_thread; }
static void shutdown_if_idle(void) {
  if (initialized && !objects) {
#ifdef TOM_UI_TEST
    if (events) fclose(events); if (trace) fclose(trace); events = trace = NULL; scripted = 0;
#endif
    TTF_Quit(); SDL_Quit(); initialized = 0;
  }
}
static void acquired(void) { objects++; tom_object_acquired(); }
static void released(void) { objects--; tom_object_released(); shutdown_if_idle(); }
void tom_window_free(TomWindow *value) { if (value) { SDL_DestroyRenderer(value->renderer); SDL_DestroyWindow(value->window); free(value); released(); } }
void tom_font_free(TomFont *value) { if (value) { TTF_CloseFont(value->font); free(value); released(); } }
void tom_event_free(TomEvent *value) { if (value) { free(value); released(); } }
int32_t tom_window_new(const char *title, int32_t width, int32_t height, TomWindow **out) {
  if (!out || !tom_utf8_valid(title) || width < 1 || height < 1 || width > 16384 || height > 16384) return TOM_INVALID;
  int32_t error = initialize(); if (error) return error;
  TomWindow *value = calloc(1, sizeof(*value)); if (!value) { shutdown_if_idle(); return TOM_MEMORY; }
  value->window = SDL_CreateWindow(title, width, height, SDL_WINDOW_RESIZABLE | SDL_WINDOW_HIGH_PIXEL_DENSITY);
  if (value->window) value->renderer = SDL_CreateRenderer(value->window, NULL);
  if (value->window && !value->renderer) value->renderer = SDL_CreateRenderer(value->window, "software");
  if (!value->window || !value->renderer || !SDL_SetRenderLogicalPresentation(value->renderer, width, height, SDL_LOGICAL_PRESENTATION_LETTERBOX) || !SDL_StartTextInput(value->window)) {
    if (value->renderer) SDL_DestroyRenderer(value->renderer); if (value->window) SDL_DestroyWindow(value->window); free(value); shutdown_if_idle(); return TOM_RESOURCE;
  }
  SDL_SetRenderDrawBlendMode(value->renderer, SDL_BLENDMODE_BLEND);
  acquired(); tom_window_free(*out); *out = value; return TOM_OK;
}
int32_t tom_font_new(int32_t size, TomFont **out) {
  if (!out || size < 1 || size > 512) return TOM_INVALID;
  int32_t error = initialize(); if (error) return error;
  const char *base = SDL_GetBasePath();
  if (!base) { shutdown_if_idle(); return TOM_RESOURCE; }
  char *file = malloc(strlen(base) + sizeof("DejaVuSans.ttf"));
  if (!file) { shutdown_if_idle(); return TOM_MEMORY; }
  strcpy(file, base); strcat(file, "DejaVuSans.ttf");
  TomFont *value = calloc(1, sizeof(*value));
  if (!value) { free(file); shutdown_if_idle(); return TOM_MEMORY; }
  value->font = TTF_OpenFont(file, (float)size); free(file);
  if (!value->font) { free(value); shutdown_if_idle(); return TOM_RESOURCE; }
  acquired(); tom_font_free(*out); *out = value; return TOM_OK;
}
int32_t tom_event_new(TomEvent **out) {
  if (!out) return TOM_INVALID;
  int32_t error = initialize(); if (error) return error;
  TomEvent *value = calloc(1, sizeof(*value)); if (!value) { shutdown_if_idle(); return TOM_MEMORY; }
  acquired(); tom_event_free(*out); *out = value; return TOM_OK;
}
static int32_t coordinates(TomWindow *window, float x, float y, TomEvent *out) {
  float logical_x, logical_y;
  if (!SDL_RenderCoordinatesFromWindow(window->renderer, x, y, &logical_x, &logical_y)) return TOM_RESOURCE;
  if (!isfinite(logical_x) || !isfinite(logical_y) || logical_x < INT32_MIN || logical_x >= INT32_MAX || logical_y < INT32_MIN || logical_y >= INT32_MAX) return TOM_BOUNDS;
  out->x = (int32_t)floorf(logical_x); out->y = (int32_t)floorf(logical_y); return TOM_OK;
}
static int32_t translate(TomWindow *window, SDL_Event *event, TomEvent *out) {
  memset(out, 0, sizeof(*out));
  switch (event->type) {
    case SDL_EVENT_QUIT: case SDL_EVENT_WINDOW_CLOSE_REQUESTED: out->kind = 1; break;
    case SDL_EVENT_TEXT_INPUT:
      out->kind = 2; out->window_id = (int32_t)event->text.windowID;
      if (!tom_utf8_valid(event->text.text)) return TOM_INVALID;
      if (strlen(event->text.text) >= sizeof(out->text)) return TOM_CAPACITY;
      strcpy(out->text, event->text.text); break;
    case SDL_EVENT_KEY_DOWN:
      out->kind = 3; out->key = event->key.key == SDLK_KP_ENTER ? 13 : (int32_t)event->key.key;
      out->repeat = event->key.repeat ? 1 : 0; out->window_id = (int32_t)event->key.windowID; break;
    case SDL_EVENT_MOUSE_BUTTON_DOWN:
      out->kind = 4; out->button = event->button.button; out->window_id = (int32_t)event->button.windowID;
      return coordinates(window, event->button.x, event->button.y, out);
    case SDL_EVENT_WINDOW_RESIZED: case SDL_EVENT_WINDOW_PIXEL_SIZE_CHANGED:
      out->kind = 5; out->width = event->window.data1; out->height = event->window.data2; out->window_id = (int32_t)event->window.windowID; break;
    case SDL_EVENT_WINDOW_EXPOSED: out->kind = 6; out->window_id = (int32_t)event->window.windowID; break;
    default: break;
  }
  return TOM_OK;
}
#ifdef TOM_UI_TEST
static int32_t scripted_event(TomWindow *window, TomEvent *out) {
  char line[1024]; memset(out, 0, sizeof(*out));
  if (!events || !fgets(line, sizeof(line), events)) { out->kind = 1; return TOM_OK; }
  line[strcspn(line, "\r\n")] = 0;
  if (!strncmp(line, "text ", 5)) {
    if (strlen(line + 5) >= sizeof(out->text) || !tom_utf8_valid(line + 5)) return TOM_INVALID;
    out->kind = 2; strcpy(out->text, line + 5);
  } else if (sscanf(line, "key %d", &out->key) == 1) out->kind = 3;
  else if (sscanf(line, "mouse %d %d", &out->x, &out->y) == 2) {
    out->kind = 4; out->button = 1; return coordinates(window, (float)out->x, (float)out->y, out);
  } else if (sscanf(line, "resize %d %d", &out->width, &out->height) == 2) {
    out->kind = 5; if (!SDL_SetWindowSize(window->window, out->width, out->height)) return TOM_RESOURCE;
    SDL_PumpEvents();
  } else if (!strcmp(line, "quit")) out->kind = 1;
  else if (!strncmp(line, "wait ", 5)) { SDL_Delay((Uint32)strtoul(line + 5, NULL, 10)); out->kind = 6; }
  else return TOM_INVALID;
  return TOM_OK;
}
#endif
int32_t tom_event_wait(TomWindow *window, TomEvent *out) {
  if (!window || !out || !on_main()) return TOM_RESOURCE;
#ifdef TOM_UI_TEST
  if (scripted) return scripted_event(window, out);
#endif
  SDL_Event event;
  do { if (!SDL_WaitEvent(&event)) return TOM_RESOURCE; int32_t error = translate(window, &event, out); if (error) return error; } while (!out->kind);
  return TOM_OK;
}
int32_t tom_event_poll(TomWindow *window, TomEvent *out, int32_t *available) {
  if (!window || !out || !available || !on_main()) return TOM_RESOURCE;
  SDL_Event event; *available = 0;
  while (SDL_PollEvent(&event)) { int32_t error = translate(window, &event, out); if (error) return error; if (out->kind) { *available = 1; return TOM_OK; } }
  memset(out, 0, sizeof(*out)); return TOM_OK;
}
int32_t tom_event_field(const TomEvent *event, int32_t field, int32_t *out) {
  if (!event || !out) return TOM_INVALID;
  switch (field) {
    case 0: *out = event->kind; break; case 1: *out = event->x; break; case 2: *out = event->y; break;
    case 3: *out = event->button; break; case 4: *out = event->key; break; case 5: *out = event->width; break;
    case 6: *out = event->height; break; case 7: *out = event->window_id; break; case 8: *out = event->repeat; break;
    default: return TOM_BOUNDS;
  }
  return TOM_OK;
}
int32_t tom_event_text(const TomEvent *event, TomText *out) { return event ? tom_text_set(out, event->text) : TOM_INVALID; }
static SDL_Color color(uint32_t rgba) { SDL_Color result = { (Uint8)(rgba >> 24), (Uint8)(rgba >> 16), (Uint8)(rgba >> 8), (Uint8)rgba }; return result; }
int32_t tom_window_clear(TomWindow *window, uint32_t rgba) {
  if (!window || !on_main()) return TOM_RESOURCE; SDL_Color c = color(rgba);
  return SDL_SetRenderDrawColor(window->renderer, c.r, c.g, c.b, c.a) && SDL_RenderClear(window->renderer) ? TOM_OK : TOM_RESOURCE;
}
int32_t tom_draw_rect(TomWindow *window, int32_t x, int32_t y, int32_t width, int32_t height, uint32_t rgba) {
  if (!window || !on_main()) return TOM_RESOURCE; if (width < 0 || height < 0) return TOM_INVALID;
  SDL_Color c = color(rgba); SDL_FRect rectangle = { (float)x, (float)y, (float)width, (float)height };
  return SDL_SetRenderDrawColor(window->renderer, c.r, c.g, c.b, c.a) && SDL_RenderFillRect(window->renderer, &rectangle) ? TOM_OK : TOM_RESOURCE;
}
int32_t tom_measure_text(TomFont *font, const char *text, int32_t *out) {
  if (!font || !out || !on_main() || !tom_utf8_valid(text)) return TOM_INVALID;
  int width, height; if (!TTF_GetStringSize(font->font, text, 0, &width, &height)) return TOM_RESOURCE;
  *out = width; return TOM_OK;
}
int32_t tom_draw_text(TomWindow *window, TomFont *font, const char *text, int32_t x, int32_t y, uint32_t rgba) {
  if (!window || !font || !on_main() || !tom_utf8_valid(text)) return TOM_INVALID;
#ifdef TOM_UI_TEST
  if (trace) { fprintf(trace, "TEXT %d %d %s\n", x, y, text); fflush(trace); }
#endif
  if (!*text) return TOM_OK;
  SDL_Surface *surface = TTF_RenderText_Blended(font->font, text, 0, color(rgba)); if (!surface) return TOM_RESOURCE;
  SDL_Texture *texture = SDL_CreateTextureFromSurface(window->renderer, surface);
  SDL_FRect rectangle = { (float)x, (float)y, (float)surface->w, (float)surface->h }; SDL_DestroySurface(surface);
  if (!texture) return TOM_RESOURCE;
  int32_t result = SDL_RenderTexture(window->renderer, texture, NULL, &rectangle) ? TOM_OK : TOM_RESOURCE;
  SDL_DestroyTexture(texture); return result;
}
int32_t tom_window_present(TomWindow *window) {
  if (!window || !on_main()) return TOM_RESOURCE;
#ifdef TOM_UI_TEST
  const char *snapshot = getenv("TOM_UI_SNAPSHOT");
  if (snapshot) { SDL_Surface *image = SDL_RenderReadPixels(window->renderer, NULL); if (!image) return TOM_RESOURCE; bool ok = SDL_SaveBMP(image, snapshot); SDL_DestroySurface(image); if (!ok) return TOM_RESOURCE; }
  if (trace) { fputs("FRAME\n", trace); fflush(trace); }
#endif
  return SDL_RenderPresent(window->renderer) ? TOM_OK : TOM_RESOURCE;
}
