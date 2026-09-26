#include "tom_runtime.h"
#include "platform.h"
#include "catalog.h"
#define SDL_MAIN_HANDLED
#include <SDL3/SDL.h>
#include <SDL3/SDL_main.h>
#include <SDL3_ttf/SDL_ttf.h>
#include <stdlib.h>
#include <string.h>
#include <stdio.h>
#include <math.h>
#include "ui_internal.h"
struct TomVisual { SDL_Texture *texture; TomWindow *owner; int width, height, origin_x, baseline, advance; };
static int initialized, objects;
static SDL_ThreadID main_thread;
static TomWindow *windows;
#ifdef TOM_UI_TEST
static FILE *events, *trace;
static int scripted;
#endif
static int32_t initialize(void) {
  if (initialized) return SDL_GetCurrentThreadID() == main_thread ? TOM_OK : TOM_RESOURCE;
  int32_t error = tom_sdl_acquire(SDL_INIT_VIDEO); if (error) return error;
  if (!TTF_Init()) { tom_sdl_release(SDL_INIT_VIDEO); return TOM_RESOURCE; }
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
    TTF_Quit(); tom_sdl_release(SDL_INIT_VIDEO); initialized = 0;
  }
}
static void acquired(void) { objects++; tom_object_acquired(); }
static void released(void) { objects--; tom_object_released(); shutdown_if_idle(); }
static void window_release(TomWindow *value) {
  if (!--value->references) {
    TomWindow **link = &windows;
    while (*link && *link != value) link = &(*link)->next;
    if (*link) *link = value->next;
    SDL_DestroyRenderer(value->renderer); SDL_DestroyWindow(value->window); free(value); released();
  }
}
int tom_ui_on_main(void) { return on_main(); }
void tom_ui_window_retain(TomWindow *value) { value->references++; }
void tom_ui_window_release(TomWindow *value) { window_release(value); }
void tom_window_free(TomWindow *value) { if (value) { value->closed = 1; window_release(value); } }
void tom_font_free(TomFont *value) { if (value) { TTF_CloseFont(value->font); free(value); released(); } }
void tom_event_free(TomEvent *value) { if (value) { tom_text_free(value->dynamic_text); free(value); released(); } }
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
  value->references = 1;
  value->next = windows; windows = value;
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
int32_t tom_font_file(const char *relative, int32_t size, TomFont **out) {
  if (!out || size < 1 || size > 512) return TOM_INVALID;
  int32_t error = initialize(); if (error) return error;
  char *file = NULL; error = tom_asset_path(relative, &file);
  if (error) { shutdown_if_idle(); return error; }
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
  if (!isfinite(logical_x) || !isfinite(logical_y) || logical_x < -2147483648.0f || logical_x >= 2147483648.0f || logical_y < -2147483648.0f || logical_y >= 2147483648.0f) return TOM_BOUNDS;
  out->x = (int32_t)floorf(logical_x); out->y = (int32_t)floorf(logical_y);
  out->precise_x = logical_x; out->precise_y = logical_y;
#ifdef TOM_UI_TEST
  if(trace && getenv("TOM_UI_TRACE_INPUT"))fprintf(trace,"POINTER %d %d %d %d\n",out->kind,out->x,out->y,out->button);
#endif
  return TOM_OK;
}
static void event_clear(TomEvent *out) {
  TomText *text=out->dynamic_text;memset(out,0,sizeof(*out));out->dynamic_text=text;
  if(text){text->length=0;text->data[0]=0;}
}
const char *tom_ui_event_text(const TomEvent *event) { return event->dynamic_text&&event->dynamic_text->length?event->dynamic_text->data:event->text; }
static int32_t event_set_text(TomWindow *window,TomEvent *out,const char *text) {
  if(!tom_utf8_valid(text))return TOM_INVALID;
  if(window&&window->editor_count){
    if(!out->dynamic_text){int32_t e=tom_text_dynamic_new("",67108864,&out->dynamic_text);if(e)return e;}
    return tom_text_set(out->dynamic_text,text);
  }
  if(strlen(text)>=sizeof(out->text))return TOM_CAPACITY;
  strcpy(out->text,text);return TOM_OK;
}
static int32_t translate(TomWindow *window, SDL_Event *event, TomEvent *out) {
  event_clear(out);
  SDL_Window *native = SDL_GetWindowFromEvent(event);
  TomWindow *target = windows;
  while (target && target->window != native) target = target->next;
  if (native && (!target || target->closed)) return TOM_OK;
  // SDL may report a release without windowID after the pointer leaves a window.
  // Route it to the window that owns the matching held button so drags can finish.
  if (!native && event->type == SDL_EVENT_MOUSE_BUTTON_UP && event->button.button >= 1 && event->button.button <= 31) {
    uint32_t mask = UINT32_C(1) << (event->button.button - 1);
    for (TomWindow *candidate=windows; candidate; candidate=candidate->next)
      if (!candidate->closed && (candidate->buttons & mask)) { target=candidate; break; }
  }
  if (event->common.timestamp > INT64_MAX) return TOM_OVERFLOW;
  out->timestamp = (int64_t)event->common.timestamp;
  switch (event->type) {
    case SDL_EVENT_QUIT: out->kind = 1; break;
    case SDL_EVENT_WINDOW_CLOSE_REQUESTED: out->kind = 1; out->window_id = (int32_t)event->window.windowID; break;
    case SDL_EVENT_TEXT_INPUT:
      out->kind = 2; out->window_id = (int32_t)event->text.windowID;
      return event_set_text(target,out,event->text.text);
    case SDL_EVENT_TEXT_EDITING:
      if(!target||!target->editor_count)break;
      out->kind=13;out->window_id=(int32_t)event->edit.windowID;
      out->composition_start=event->edit.start;out->composition_length=event->edit.length;
      return event_set_text(target,out,event->edit.text);
    case SDL_EVENT_KEY_DOWN: case SDL_EVENT_KEY_UP:
      out->kind = event->type == SDL_EVENT_KEY_DOWN ? 3 : target && (target->extended||target->editor_count) ? 7 : 0;
      out->key = event->key.key == SDLK_KP_ENTER ? 13 : (int32_t)event->key.key;
      out->repeat = event->key.repeat ? 1 : 0; out->window_id = (int32_t)event->key.windowID;
      out->scancode = (int32_t)event->key.scancode; out->modifiers = (int32_t)event->key.mod;
      if (target && out->scancode > 0 && out->scancode < SDL_SCANCODE_COUNT)
        target->held[out->scancode] = event->key.down ? 1 : 0;
      break;
    case SDL_EVENT_WINDOW_FOCUS_LOST: case SDL_EVENT_WINDOW_FOCUS_GAINED:
      out->window_id = (int32_t)event->window.windowID;
      if (target && event->type == SDL_EVENT_WINDOW_FOCUS_LOST) { memset(target->held, 0, sizeof(target->held)); target->buttons=0; }
      out->kind = target && (target->extended || target->pointer_events || target->editor_count) ? (event->type == SDL_EVENT_WINDOW_FOCUS_LOST ? 8 : 9) : 0; break;
    case SDL_EVENT_MOUSE_BUTTON_DOWN: case SDL_EVENT_MOUSE_BUTTON_UP:
      out->kind = event->type==SDL_EVENT_MOUSE_BUTTON_DOWN ? 4 : target && (target->pointer_events||target->editor_count) ? 11 : 0;
      out->clicks=event->button.clicks; out->button = event->button.button; out->window_id = target ? (int32_t)SDL_GetWindowID(target->window) : (int32_t)event->button.windowID;
      if(target && event->button.button>=1 && event->button.button<=31) {
        uint32_t mask=UINT32_C(1)<<(event->button.button-1);
        if(event->button.down)target->buttons|=mask;else target->buttons&=~mask;out->buttons=(int32_t)target->buttons;
      }
      return coordinates(target ? target : window, event->button.x, event->button.y, out);
    case SDL_EVENT_MOUSE_MOTION:
      if(!target || !(target->pointer_events||target->editor_count))break;
      target->buttons=event->motion.state;out->buttons=(int32_t)target->buttons;
      out->kind=10;out->window_id=(int32_t)event->motion.windowID;
      return coordinates(target,event->motion.x,event->motion.y,out);
    case SDL_EVENT_MOUSE_WHEEL:
      if (!target || !(target->wheel_events||target->editor_count)) break;
      if (!isfinite(event->wheel.x) || !isfinite(event->wheel.y)) return TOM_INVALID;
      out->kind=12; out->window_id=(int32_t)event->wheel.windowID;
      out->wheel_x=event->wheel.x; out->wheel_y=event->wheel.y;
      if(event->wheel.direction==SDL_MOUSEWHEEL_FLIPPED){out->wheel_x=-out->wheel_x;out->wheel_y=-out->wheel_y;}
      return coordinates(target,event->wheel.mouse_x,event->wheel.mouse_y,out);
    case SDL_EVENT_WINDOW_RESIZED: case SDL_EVENT_WINDOW_PIXEL_SIZE_CHANGED:
      out->kind = 5; out->width = event->window.data1; out->height = event->window.data2; out->window_id = (int32_t)event->window.windowID; break;
    case SDL_EVENT_WINDOW_EXPOSED: out->kind = 6; out->window_id = (int32_t)event->window.windowID; break;
    default: break;
  }
  return TOM_OK;
}
#ifdef TOM_UI_TEST
static int32_t scripted_event(TomWindow *window, TomEvent *out) {
  char line[1024]; event_clear(out);
  float px,py,wx,wy;int flipped;
  int32_t error=tom_time_now(&out->timestamp);if(error)return error;
  if (!events || !fgets(line, sizeof(line), events)) { out->kind = 1; return TOM_OK; }
  line[strcspn(line, "\r\n")] = 0;
  if (!strncmp(line, "text ", 5)) {
    out->kind=2;return event_set_text(window,out,line+5);
  } else if(!strncmp(line,"composition ",12)) {
    int offset=0;if(sscanf(line+12,"%d %d %n",&out->composition_start,&out->composition_length,&offset)!=2)return TOM_INVALID;
    out->kind=window->editor_count?13:0;return event_set_text(window,out,line+12+offset);
  } else if(sscanf(line,"keydown %d %d",&out->key,&out->modifiers)==2) {out->kind=3;
  } else if (sscanf(line,"down %d %d %d %d",&out->key,&out->scancode,&out->repeat,&out->modifiers)>=3) {
    out->kind=3;if(out->scancode>0 && out->scancode<SDL_SCANCODE_COUNT)window->held[out->scancode]=1;
  } else if(sscanf(line,"up %d %d",&out->key,&out->scancode)==2) {
    out->kind=(window->extended||window->editor_count)?7:0;if(out->scancode>0 && out->scancode<SDL_SCANCODE_COUNT)window->held[out->scancode]=0;
  } else if(!strcmp(line,"focuslost")) {
    out->kind=window->extended||(window->pointer_events||window->editor_count)?8:0;memset(window->held,0,sizeof(window->held));window->buttons=0;
  } else if(!strcmp(line,"focusgain"))out->kind=window->extended||(window->pointer_events||window->editor_count)?9:0;
  else if(sscanf(line,"wheel %f %f %f %f %d",&px,&py,&wx,&wy,&flipped)==5) {
    if(!isfinite(wx)||!isfinite(wy)||(flipped!=0&&flipped!=1))return TOM_INVALID;
    out->kind=(window->wheel_events||window->editor_count)?12:0;out->wheel_x=flipped?-wx:wx;out->wheel_y=flipped?-wy:wy;
    return coordinates(window,px,py,out);
  } else if(sscanf(line,"motion %f %f",&px,&py)==2) {
    out->kind=(window->pointer_events||window->editor_count)?10:0;out->buttons=(int32_t)window->buttons;
    return coordinates(window,px,py,out);
  } else if(sscanf(line,"release %d %d",&out->x,&out->y)==2) {
    out->kind=(window->pointer_events||window->editor_count)?11:0;out->button=1;window->buttons=0;
    return coordinates(window,(float)out->x,(float)out->y,out);
  } else if (sscanf(line, "key %d", &out->key) == 1) out->kind = 3;
  else if (sscanf(line, "mouse %d %d", &out->x, &out->y) == 2) {
    out->kind = 4; out->button = 1;
    sscanf(line, "mouse %d %d %d", &out->x, &out->y, &out->button);
    if (out->button < 1 || out->button > 31) return TOM_INVALID;
    window->buttons=1u<<(out->button-1);out->buttons=(int32_t)window->buttons;
    return coordinates(window, (float)out->x, (float)out->y, out);
  } else if (sscanf(line, "resize %d %d", &out->width, &out->height) == 2) {
    out->kind = 5; if (!SDL_SetWindowSize(window->window, out->width, out->height)) return TOM_RESOURCE;
    SDL_PumpEvents();
  } else if (!strcmp(line, "quit")) out->kind = 1;
  else if (!strcmp(line, "expose")) out->kind = 6;
  else if (!strncmp(line, "wait ", 5)) { SDL_Delay((Uint32)strtoul(line + 5, NULL, 10)); out->kind = 6; }
  else return TOM_INVALID;
  return TOM_OK;
}
#endif
int32_t tom_event_wait(TomWindow *window, TomEvent *out) {
  if (!window || window->closed || !out || !on_main()) return TOM_RESOURCE;
#ifdef TOM_UI_TEST
  if (scripted) return scripted_event(window, out);
#endif
  SDL_Event event;
  do { if (!SDL_WaitEvent(&event)) return TOM_RESOURCE; int32_t error = translate(window, &event, out); if (error) return error; } while (!out->kind);
  return TOM_OK;
}
int32_t tom_event_poll(TomWindow *window, TomEvent *out, int32_t *available) {
  if (!window || window->closed || !out || !available || !on_main()) return TOM_RESOURCE;
  SDL_Event event; *available = 0;
  while (SDL_PollEvent(&event)) { int32_t error = translate(window, &event, out); if (error) return error; if (out->kind) { *available = 1; return TOM_OK; } }
  event_clear(out); return TOM_OK;
}
int32_t tom_event_field(const TomEvent *event, int32_t field, int32_t *out) {
  if (!event || !out) return TOM_INVALID;
  switch (field) {
    case 0: *out = event->kind; break; case 1: *out = event->x; break; case 2: *out = event->y; break;
    case 3: *out = event->button; break; case 4: *out = event->key; break; case 5: *out = event->width; break;
    case 6: *out = event->height; break; case 7: *out = event->window_id; break; case 8: *out = event->repeat; break;
    case 9: *out = event->scancode; break; case 10: *out = event->modifiers; break;
    case 11: *out = event->buttons; break;
    case 14: *out=event->clicks;break;case 15:*out=event->composition_start;break;case 16:*out=event->composition_length;break;
    default: return TOM_BOUNDS;
  }
  return TOM_OK;
}
int32_t tom_event_text(const TomEvent *event, TomText *out) { return event ? tom_text_set(out, tom_ui_event_text(event)) : TOM_INVALID; }
int32_t tom_event_field_f64(const TomEvent *event, int32_t field, double *out) {
  if(!event||!out)return TOM_INVALID;
  switch(field){case 1:*out=event->precise_x;break;case 2:*out=event->precise_y;break;case 12:*out=event->wheel_x;break;case 13:*out=event->wheel_y;break;default:return TOM_BOUNDS;}
  return TOM_OK;
}
int32_t tom_event_time(const TomEvent *event, int64_t *out) { if (!event || !out) return TOM_INVALID; *out = event->timestamp; return TOM_OK; }
int32_t tom_window_events(TomWindow *window, int32_t extended) {
  if (!window || window->closed || !on_main()) return TOM_RESOURCE;
  if (extended != 0 && extended != 1) return TOM_INVALID;
  window->extended = extended; memset(window->held, 0, sizeof(window->held)); return TOM_OK;
}
int32_t tom_window_pointer_events(TomWindow *window,int32_t enabled) {
  if(!window || window->closed || !on_main())return TOM_RESOURCE;
  if(enabled!=0 && enabled!=1)return TOM_INVALID;window->pointer_events=enabled;window->buttons=0;return TOM_OK;
}
int32_t tom_window_wheel_events(TomWindow *window,int32_t enabled) {
  if(!window||window->closed||!on_main())return TOM_RESOURCE;
  if(enabled!=0&&enabled!=1)return TOM_INVALID;window->wheel_events=enabled;return TOM_OK;
}
int32_t tom_key_held(TomWindow *window, int32_t scancode, int32_t *out) {
  if (!window || window->closed || !on_main()) return TOM_RESOURCE;
  if (!out || scancode <= 0 || scancode >= SDL_SCANCODE_COUNT) return TOM_INVALID;
  *out = window->held[scancode] ? 1 : 0; return TOM_OK;
}
int32_t tom_event_until(TomWindow *window, TomEvent *out, int64_t deadline, int32_t *available) {
  if (!window || window->closed || !out || !available || !on_main()) return TOM_RESOURCE;
  if (deadline < 0) return TOM_INVALID;
  *available = 0; event_clear(out);
  for (;;) {
    int64_t now; int32_t error = tom_time_now(&now); if (error) return error;
    int64_t remaining = deadline > now ? deadline - now : 0;
    SDL_Event event;
#ifdef TOM_UI_TEST
    if (scripted) { error = scripted_event(window, out); if (error) return error; *available = out->kind != 0; return TOM_OK; }
    if (tom_test_time_get() >= 0) {
      if (!SDL_PollEvent(&event)) { tom_test_time_set(deadline > now ? deadline : now); return TOM_OK; }
    } else
#endif
    {
      int32_t timeout = remaining / 1000000 >= INT32_MAX ? INT32_MAX : (int32_t)(remaining / 1000000 + (remaining % 1000000 != 0));
      SDL_ClearError();
      if (!SDL_WaitEventTimeout(&event, timeout)) {
        if (*SDL_GetError()) return TOM_RESOURCE;
        if (!remaining) return TOM_OK;
        continue;
      }
    }
    error = translate(window, &event, out); if (error) return error;
    if (out->kind) { *available = 1; return TOM_OK; }
    event_clear(out);
    if (!remaining) return TOM_OK;
  }
}
static SDL_Color color(uint32_t rgba) { SDL_Color result = { (Uint8)(rgba >> 24), (Uint8)(rgba >> 16), (Uint8)(rgba >> 8), (Uint8)rgba }; return result; }
int32_t tom_window_clear(TomWindow *window, uint32_t rgba) {
  if (!window || window->closed || !on_main()) return TOM_RESOURCE; SDL_Color c = color(rgba);
  return SDL_SetRenderDrawColor(window->renderer, c.r, c.g, c.b, c.a) && SDL_RenderClear(window->renderer) ? TOM_OK : TOM_RESOURCE;
}
int32_t tom_draw_rect(TomWindow *window, int32_t x, int32_t y, int32_t width, int32_t height, uint32_t rgba) {
  if (!window || window->closed || !on_main()) return TOM_RESOURCE; if (width < 0 || height < 0) return TOM_INVALID;
  SDL_Color c = color(rgba); SDL_FRect rectangle = { (float)x, (float)y, (float)width, (float)height };
  return SDL_SetRenderDrawColor(window->renderer, c.r, c.g, c.b, c.a) && SDL_RenderFillRect(window->renderer, &rectangle) ? TOM_OK : TOM_RESOURCE;
}
int32_t tom_measure_text(TomFont *font, const char *text, int32_t *out) {
  if (!font || !out || !on_main() || !tom_utf8_valid(text)) return TOM_INVALID;
  int width, height; if (!TTF_GetStringSize(font->font, text, 0, &width, &height)) return TOM_RESOURCE;
  *out = width; return TOM_OK;
}
int32_t tom_draw_text(TomWindow *window, TomFont *font, const char *text, int32_t x, int32_t y, uint32_t rgba) {
  if (!window || window->closed || !font || !on_main() || !tom_utf8_valid(text)) return TOM_INVALID;
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
  if (!window || window->closed || !on_main()) return TOM_RESOURCE;
#ifdef TOM_UI_TEST
  const char *snapshot = getenv("TOM_UI_SNAPSHOT");
  if (snapshot) { SDL_Surface *image = SDL_RenderReadPixels(window->renderer, NULL); if (!image) return TOM_RESOURCE; bool ok = SDL_SaveBMP(image, snapshot); SDL_DestroySurface(image); if (!ok) return TOM_RESOURCE; }
  if (trace) { fputs("FRAME\n", trace); fflush(trace); }
#endif
  return SDL_RenderPresent(window->renderer) ? TOM_OK : TOM_RESOURCE;
}

static int coordinate(double value) { return isfinite(value) && value >= -10000000.0 && value <= 10000000.0; }
static SDL_FColor gradient(uint32_t top, uint32_t bottom, double fraction) {
  SDL_Color a=color(top), b=color(bottom);
  float t=(float)fmax(0,fmin(1,fraction));
  return (SDL_FColor){(a.r+(b.r-a.r)*t)/255.0f,(a.g+(b.g-a.g)*t)/255.0f,
    (a.b+(b.b-a.b)*t)/255.0f,(a.a+(b.a-a.a)*t)/255.0f};
}
int32_t tom_draw_round_rect(TomWindow *window,double x,double y,double width,double height,double radius,uint32_t top,uint32_t bottom) {
  if (!window || window->closed || !on_main()) return TOM_RESOURCE;
  if (!coordinate(x) || !coordinate(y) || !isfinite(width) || !isfinite(height) || !isfinite(radius) ||
      width<0 || height<0 || width>16384 || height>16384 || radius<0 ||
      !coordinate(x+width+1) || !coordinate(y+height+1)) return TOM_INVALID;
  if (!width || !height) return TOM_OK;
  radius=fmin(radius,fmin(width,height)/2);
  // Fixed, bounded stack geometry: 16 segments per corner, with a one-unit alpha fringe.
  enum { STEPS=16, POINTS=4*(STEPS+1) };
  SDL_Vertex vertices[1+POINTS*2]; int indices[POINTS*9];
  vertices[0]=(SDL_Vertex){{(float)(x+width/2),(float)(y+height/2)},gradient(top,bottom,.5),{0,0}};
  const double cx[]={x+width-radius,x+width-radius,x+radius,x+radius};
  const double cy[]={y+radius,y+height-radius,y+height-radius,y+radius};
  const double inner=fmax(0,radius-.5),outer=radius+.5;
  for(int i=0;i<POINTS;i++) {
    int corner=i/(STEPS+1), step=i%(STEPS+1);
    double angle=(corner-1+step/(double)STEPS)*1.57079632679489661923;
    double nx=cos(angle),ny=sin(angle),iy=cy[corner]+ny*inner,oy=cy[corner]+ny*outer;
    SDL_FColor edge=gradient(top,bottom,(oy-y)/height);edge.a=0;
    vertices[1+i]=(SDL_Vertex){{(float)(cx[corner]+nx*inner),(float)iy},gradient(top,bottom,(iy-y)/height),{0,0}};
    vertices[1+POINTS+i]=(SDL_Vertex){{(float)(cx[corner]+nx*outer),(float)oy},edge,{0,0}};
    int a=1+i,b=1+(i+1)%POINTS,c=a+POINTS,d=b+POINTS;
    int triangles[]={0,a,b,a,c,b,b,c,d};
    memcpy(indices+9*i,triangles,sizeof triangles);
  }
  return SDL_RenderGeometry(window->renderer,NULL,vertices,1+POINTS*2,indices,POINTS*9) ? TOM_OK : TOM_RESOURCE;
}
int32_t tom_draw_line(TomWindow *window, double x1, double y1, double x2, double y2, double thickness, uint32_t rgba) {
  if (!window || window->closed || !on_main()) return TOM_RESOURCE;
  if (!coordinate(x1) || !coordinate(x2) || !coordinate(y1) || !coordinate(y2) || !isfinite(thickness) || thickness <= 0 || thickness > 16384) return TOM_INVALID;
  double dx = x2 - x1, dy = y2 - y1, length = hypot(dx, dy);
  if (!length) return TOM_OK;
  double ox = -dy / length * thickness / 2, oy = dx / length * thickness / 2;
  SDL_Color c = color(rgba); SDL_FColor fc = { c.r / 255.0f, c.g / 255.0f, c.b / 255.0f, c.a / 255.0f };
  SDL_Vertex v[] = {
    {{(float)(x1 + ox),(float)(y1 + oy)},fc,{0,0}}, {{(float)(x2 + ox),(float)(y2 + oy)},fc,{0,0}},
    {{(float)(x2 - ox),(float)(y2 - oy)},fc,{0,0}}, {{(float)(x1 - ox),(float)(y1 - oy)},fc,{0,0}},
  };
  const int indices[] = {0,1,2,0,2,3};
  return SDL_RenderGeometry(window->renderer, NULL, v, 4, indices, 6) ? TOM_OK : TOM_RESOURCE;
}
int32_t tom_draw_ellipse(TomWindow *window, double x, double y, double rx, double ry, uint32_t rgba) {
  if (!window || window->closed || !on_main()) return TOM_RESOURCE;
  if (!coordinate(x) || !coordinate(y) || !isfinite(rx) || !isfinite(ry) || rx <= 0 || ry <= 0 || rx > 16384 || ry > 16384) return TOM_INVALID;
  SDL_Color c = color(rgba); SDL_FColor fc = { c.r / 255.0f, c.g / 255.0f, c.b / 255.0f, c.a / 255.0f };
  SDL_Vertex v[129]; int indices[384];
  v[0] = (SDL_Vertex){{(float)x,(float)y},fc,{0,0}};
  for (int i = 0; i < 128; i++) {
    double angle = 6.2831853071795864769 * i / 128;
    v[i + 1] = (SDL_Vertex){{(float)(x + rx * cos(angle)),(float)(y + ry * sin(angle))},fc,{0,0}};
    indices[3*i] = 0; indices[3*i+1] = i+1; indices[3*i+2] = (i+1)%128+1;
  }
  return SDL_RenderGeometry(window->renderer, NULL, v, 129, indices, 384) ? TOM_OK : TOM_RESOURCE;
}
int32_t tom_window_clip(TomWindow *window, int32_t x, int32_t y, int32_t w, int32_t h) {
  if (!window || window->closed || !on_main()) return TOM_RESOURCE;
  if (w < 0 || h < 0 || (int64_t)x+w > INT32_MAX || (int64_t)y+h > INT32_MAX) return TOM_INVALID;
  SDL_Rect r = {x,y,w,h}; return SDL_SetRenderClipRect(window->renderer, &r) ? TOM_OK : TOM_RESOURCE;
}
int32_t tom_window_unclip(TomWindow *window) {
  if (!window || window->closed || !on_main()) return TOM_RESOURCE;
  return SDL_SetRenderClipRect(window->renderer, NULL) ? TOM_OK : TOM_RESOURCE;
}
static int32_t visual(TomWindow *window, TomFont *font, const char *text, uint32_t code, TomVisual **out) {
  if (!window || window->closed || !font || !out || !on_main()) return TOM_RESOURCE;
  if (text && !tom_utf8_valid(text)) return TOM_INVALID;
  int minx=0,maxx=0,miny=0,maxy=0,advance=0;
  if (!text && (!code || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff) || !TTF_FontHasGlyph(font->font,code))) return TOM_INVALID;
  if (!text && !TTF_GetGlyphMetrics(font->font, code, &minx, &maxx, &miny, &maxy, &advance)) return TOM_RESOURCE;
  TomVisual *value = calloc(1, sizeof(*value)); if (!value) return TOM_MEMORY;
  value->baseline = TTF_GetFontAscent(font->font); value->origin_x = minx < 0 ? -minx : 0; value->advance = advance;
  if (!text || *text) {
    SDL_Color white = {255,255,255,255};
    SDL_Surface *surface = text ? TTF_RenderText_Blended(font->font,text,0,white) : TTF_RenderGlyph_Blended(font->font,code,white);
    if (!surface) { free(value); return TOM_RESOURCE; }
    value->width = surface->w; value->height = surface->h;
    value->texture = SDL_CreateTextureFromSurface(window->renderer,surface); SDL_DestroySurface(surface);
    if (!value->texture) { free(value); return TOM_RESOURCE; }
    SDL_SetTextureBlendMode(value->texture, SDL_BLENDMODE_BLEND);
    if (text) value->advance = value->width;
  }
  value->owner = window; window->references++; acquired();
#ifdef TOM_UI_TEST
  if(trace && text){fprintf(trace,"VISUAL %s\n",text);fflush(trace);}
#endif
  tom_visual_free(*out); *out = value; return TOM_OK;
}
int32_t tom_visual_text(TomWindow *window, TomFont *font, const char *text, TomVisual **out) {
  if (!text) return TOM_INVALID;
  return visual(window,font,text,0,out);
}
int32_t tom_visual_glyph(TomWindow *window, TomFont *font, int32_t code, TomVisual **out) { return visual(window,font,NULL,(uint32_t)code,out); }
void tom_visual_free(TomVisual *value) {
  if (value) { if (value->texture) SDL_DestroyTexture(value->texture); window_release(value->owner); free(value); released(); }
}
int32_t tom_visual_metric(TomVisual *value, int32_t field, int32_t *out) {
  if (!value || !out) return TOM_INVALID;
  switch (field) {
    case 0: *out=value->width; break; case 1: *out=value->height; break; case 2: *out=value->origin_x; break;
    case 3: *out=value->baseline; break; case 4: *out=value->advance; break; default: return TOM_BOUNDS;
  } return TOM_OK;
}
int32_t tom_draw_visual(TomWindow *window, TomVisual *value, double x, double y, uint32_t rgba) {
  if (!window || window->closed || !value || value->owner != window || !on_main()) return TOM_RESOURCE;
  if (!coordinate(x) || !coordinate(y)) return TOM_INVALID;
  if (!value->texture) return TOM_OK;
  SDL_Color c=color(rgba); SDL_FRect r={(float)(x-value->origin_x),(float)(y-value->baseline),(float)value->width,(float)value->height};
  return SDL_SetTextureColorMod(value->texture,c.r,c.g,c.b) && SDL_SetTextureAlphaMod(value->texture,c.a) && SDL_RenderTexture(window->renderer,value->texture,NULL,&r) ? TOM_OK : TOM_RESOURCE;
}
int32_t tom_draw_visual_transform(TomWindow *window,TomVisual *value,double x,double y,double sx,double sy,double angle,uint32_t rgba) {
  if (!window || window->closed || !value || value->owner!=window || !on_main()) return TOM_RESOURCE;
  if (!coordinate(x) || !coordinate(y) || !isfinite(sx) || !isfinite(sy) || sx<=0 || sy<=0 ||
      !isfinite(angle) || sx>16384 || sy>16384) return TOM_INVALID;
  double width=value->width*sx,height=value->height*sy,ox=value->origin_x*sx,oy=value->baseline*sy;
  double reach=hypot(width+fabs(ox),height+fabs(oy));
  if (width>16384 || height>16384 || !coordinate(x-reach) || !coordinate(x+reach) ||
      !coordinate(y-reach) || !coordinate(y+reach)) return TOM_INVALID;
  if (!value->texture) return TOM_OK;
  angle=fmod(angle,360.0);
  if (sx==1 && sy==1 && angle==0) return tom_draw_visual(window,value,x,y,rgba);
  SDL_Color c=color(rgba);
  SDL_FRect rect={(float)(x-ox),(float)(y-oy),(float)width,(float)height};
  SDL_FPoint anchor={(float)ox,(float)oy};
  return SDL_SetTextureColorMod(value->texture,c.r,c.g,c.b) && SDL_SetTextureAlphaMod(value->texture,c.a) &&
    SDL_RenderTextureRotated(window->renderer,value->texture,NULL,&rect,angle,&anchor,SDL_FLIP_NONE) ? TOM_OK : TOM_RESOURCE;
}

struct TomVisualCatalog { TomCatalog slots; TomWindow *owner; };
void tom_visual_catalog_free(TomVisualCatalog *catalog) {
  if(!catalog)return;
  for(int32_t i=0;i<catalog->slots.capacity;i++)tom_visual_free(catalog->slots.entries[i].value);
  free(catalog->slots.entries);window_release(catalog->owner);free(catalog);released();
}
int32_t tom_visual_catalog_new(TomWindow *owner,int32_t capacity,TomVisualCatalog **out) {
  if(!owner || owner->closed || !out || !on_main())return TOM_RESOURCE;
  TomVisualCatalog *catalog=calloc(1,sizeof(*catalog));if(!catalog)return TOM_MEMORY;
  int32_t error=tom_catalog_init(&catalog->slots,capacity);if(error){free(catalog);return error;}
  catalog->owner=owner;owner->references++;acquired();tom_visual_catalog_free(*out);*out=catalog;return TOM_OK;
}
static int32_t catalog_visual(TomVisualCatalog *catalog,TomFont *font,const char *text,int32_t glyph,int64_t *out) {
  if(!catalog || !out || catalog->owner->closed || !on_main())return TOM_RESOURCE;
  TomCatalogEntry *entry=tom_catalog_empty(&catalog->slots);if(!entry)return TOM_CAPACITY;
  int64_t id;int32_t error=tom_handle_next(&id);if(error)return error;
  TomVisual *value=NULL;error=visual(catalog->owner,font,text,(uint32_t)glyph,&value);if(error)return error;
  entry->value=value;entry->id=id;*out=id;return TOM_OK;
}
int32_t tom_visual_catalog_text(TomVisualCatalog *catalog,TomFont *font,const char *text,int64_t *out) {
  return text?catalog_visual(catalog,font,text,0,out):TOM_INVALID;
}
int32_t tom_visual_catalog_glyph(TomVisualCatalog *catalog,TomFont *font,int32_t code,int64_t *out) {return catalog_visual(catalog,font,NULL,code,out);}
int32_t tom_visual_catalog_replace(TomVisualCatalog *catalog,int64_t id,TomFont *font,const char *text) {
  if(!catalog || !on_main())return TOM_RESOURCE;TomCatalogEntry *entry=tom_catalog_find(&catalog->slots,id);if(!entry)return TOM_RESOURCE;
  TomVisual *next=NULL;int32_t error=tom_visual_text(catalog->owner,font,text,&next);if(error)return error;
  tom_visual_free(entry->value);entry->value=next;return TOM_OK;
}
int32_t tom_visual_catalog_remove(TomVisualCatalog *catalog,int64_t id) {
  if(!catalog || catalog->owner->closed || !on_main())return TOM_RESOURCE;TomCatalogEntry *entry=tom_catalog_find(&catalog->slots,id);if(!entry)return TOM_RESOURCE;
  tom_visual_free(entry->value);*entry=(TomCatalogEntry){0};return TOM_OK;
}
int32_t tom_visual_catalog_metric(TomVisualCatalog *catalog,int64_t id,int32_t field,int32_t *out) {
  if(!catalog || catalog->owner->closed || !on_main())return TOM_RESOURCE;TomCatalogEntry *entry=tom_catalog_find(&catalog->slots,id);
  return entry?tom_visual_metric(entry->value,field,out):TOM_RESOURCE;
}
int32_t tom_visual_catalog_draw(TomWindow *window,TomVisualCatalog *catalog,int64_t id,double x,double y,uint32_t rgba) {
  if(!catalog || catalog->owner!=window)return TOM_RESOURCE;TomCatalogEntry *entry=tom_catalog_find(&catalog->slots,id);
  return entry?tom_draw_visual(window,entry->value,x,y,rgba):TOM_RESOURCE;
}
int32_t tom_visual_catalog_transform(TomWindow *window,TomVisualCatalog *catalog,int64_t id,double x,double y,double sx,double sy,double angle,uint32_t rgba) {
  if(!catalog || catalog->owner!=window)return TOM_RESOURCE;TomCatalogEntry *entry=tom_catalog_find(&catalog->slots,id);
  return entry?tom_draw_visual_transform(window,entry->value,x,y,sx,sy,angle,rgba):TOM_RESOURCE;
}

int32_t tom_clipboard_read(TomWindow *window,TomText *out) {
  if(!window||window->closed||!out||!on_main())return TOM_RESOURCE;
  SDL_ClearError();char *text=SDL_GetClipboardText();
  if(!text||*SDL_GetError()){SDL_free(text);return TOM_RESOURCE;}
  int32_t error=tom_text_set(out,text);SDL_free(text);return error;
}
int32_t tom_clipboard_write(TomWindow *window,const char *text) {
  if(!window||window->closed||!on_main())return TOM_RESOURCE;
  if(!tom_utf8_valid(text))return TOM_INVALID;
  return SDL_SetClipboardText(text)?TOM_OK:TOM_RESOURCE;
}
int32_t tom_window_logical_size(TomWindow *window,int32_t width,int32_t height) {
  if(!window||window->closed||!on_main())return TOM_RESOURCE;
  if(width<1||height<1||width>16384||height>16384)return TOM_BOUNDS;
  return SDL_SetRenderLogicalPresentation(window->renderer,width,height,SDL_LOGICAL_PRESENTATION_LETTERBOX)?TOM_OK:TOM_RESOURCE;
}
int32_t tom_window_size(TomWindow *window,int32_t field,int32_t *out) {
  if(!window||window->closed||!out||!on_main())return TOM_RESOURCE;
  if(field<0||field>1)return TOM_BOUNDS;int w,h;if(!SDL_GetWindowSize(window->window,&w,&h))return TOM_RESOURCE;*out=field?h:w;return TOM_OK;
}
