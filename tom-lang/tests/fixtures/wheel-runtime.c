#define SDL_MAIN_HANDLED
#include <SDL3/SDL.h>
#include "tom_runtime.h"
#include <assert.h>
#include <stdio.h>
int main(void) {
  TomWindow *window=NULL; TomEvent *event=NULL;
  assert(tom_window_new("wheel",320,240,&window)==TOM_OK);
  assert(tom_event_new(&event)==TOM_OK);
  int count=0; SDL_Window **windows=SDL_GetWindows(&count); assert(count==1);
  SDL_WindowID id=SDL_GetWindowID(windows[0]); SDL_free(windows);
  SDL_Event wheel={0}; wheel.wheel.type=SDL_EVENT_MOUSE_WHEEL;
  wheel.wheel.windowID=id; wheel.wheel.timestamp=123456789;
  wheel.wheel.x=.25f; wheel.wheel.y=-1.5f;
  wheel.wheel.mouse_x=10.5f; wheel.wheel.mouse_y=20.25f;
  wheel.wheel.direction=SDL_MOUSEWHEEL_FLIPPED;
  SDL_FlushEvents(SDL_EVENT_FIRST,SDL_EVENT_LAST); assert(SDL_PushEvent(&wheel));
  int32_t available=0,kind=0; assert(tom_event_poll(window,event,&available)==TOM_OK);
  while(available){assert(tom_event_field(event,0,&kind)==TOM_OK);assert(kind!=12);assert(tom_event_poll(window,event,&available)==TOM_OK);}
  assert(tom_window_wheel_events(window,1)==TOM_OK);
  SDL_FlushEvents(SDL_EVENT_FIRST,SDL_EVENT_LAST);assert(SDL_PushEvent(&wheel));
  assert(tom_event_poll(window,event,&available)==TOM_OK);assert(available);
  assert(tom_event_field(event,0,&kind)==TOM_OK);assert(kind==12);
  double value=0;int64_t time=0;
  assert(tom_event_time(event,&time)==TOM_OK);assert(time==123456789);
  assert(tom_event_field_f64(event,12,&value)==TOM_OK);assert(value==-.25);
  assert(tom_event_field_f64(event,13,&value)==TOM_OK);assert(value==1.5);
  assert(tom_event_field_f64(event,1,&value)==TOM_OK);assert(value==10.5);
  assert(tom_event_field_f64(event,2,&value)==TOM_OK);assert(value==20.25);
  assert(tom_event_field(event,1,&kind)==TOM_OK);assert(kind==10);
  assert(tom_event_field_f64(event,99,&value)==TOM_BOUNDS);
  tom_event_free(event);tom_window_free(window);assert(tom_live_objects()==0);
  puts("wheel-runtime-ok");return 0;
}
