#include "tom_runtime.h"
#include "platform.h"
#include <assert.h>
#include <math.h>
#include <stdio.h>
#include <string.h>
int32_t tom_audio_test_new(TomAudio **out);
int32_t tom_audio_test_render(TomAudio *a,float *samples,int32_t frames);
#define OK(call) assert((call)==TOM_OK)
static void silence(float *p,int frames) { for(int i=0;i<frames*2;i++)assert(p[i]==0); }
static void audio_tests(void) {
  TomAudio *a=NULL,*b=NULL;float x[4096*2],y[4096*2];int64_t position;
  OK(tom_audio_test_new(&a));OK(tom_audio_test_new(&b));
  OK(tom_audio_tone_at(a,0,440,.2,100000000,960));OK(tom_audio_tone_at(a,1,440,.3,100000000,960));
  OK(tom_audio_tone_at(b,0,440,.2,100000000,960));OK(tom_audio_tone_at(b,1,440,.3,100000000,960));
  OK(tom_audio_pause(a,0));OK(tom_audio_pause(b,0));
  OK(tom_audio_test_render(a,x,4096));
  int at=0;while(at<4096){int n=(at%113)+1;if(n>4096-at)n=4096-at;OK(tom_audio_test_render(b,y+at*2,n));at+=n;}
  assert(!memcmp(x,y,sizeof(x)));silence(x,960);
  for(int i=1200;i<4096;i++)assert(fabs(x[i*2]-.5*sin(6.2831853071795864769*440*(i-960)/48000))<0.000001);
  assert(tom_audio_tone_at(a,2,220,.1,1000,0)==TOM_LATE);
  OK(tom_audio_pause(a,1));OK(tom_audio_test_render(a,x,4096));silence(x,4096);
  OK(tom_audio_position(a,&position));assert(position==4096);
  OK(tom_audio_pause(a,0));OK(tom_audio_test_render(a,x,4096));OK(tom_audio_position(a,&position));assert(position==8192);silence(x+1664*2,4096-1664);
  // Resume reanchors the frozen sample position; latency changes the estimate only.
  OK(tom_audio_pause(a,1));tom_test_time_set(2000000000);OK(tom_audio_pause(a,0));
  int64_t mapped;OK(tom_audio_frame_time(a,8192,&mapped));assert(mapped==2000000000);
  OK(tom_audio_latency(a,15000000));OK(tom_audio_frame_time(a,8192+48000,&mapped));assert(mapped==3015000000);
  OK(tom_audio_time_frame(a,mapped,&mapped));assert(mapped==8192+48000);
  OK(tom_audio_position(a,&position));assert(position==8192);tom_test_time_set(-1);
  tom_audio_free(a);tom_audio_free(b);a=b=NULL;

  OK(tom_audio_test_new(&a));
  for(int i=0;i<256;i++)OK(tom_audio_tone_at(a,0,220,.1,1000000,480000+i));
  assert(tom_audio_tone_at(a,0,220,.1,1000000,480999)==TOM_CAPACITY);
  OK(tom_audio_stop(a,0));OK(tom_audio_pause(a,0));
  const int64_t ten_minutes=48000*600;
  OK(tom_audio_tone_at(a,0,440,.2,1000000,ten_minutes));
  for(int64_t i=0;i<ten_minutes;) { int n=ten_minutes-i>4096?4096:(int)(ten_minutes-i);OK(tom_audio_test_render(a,x,n));silence(x,n);i+=n; }
  OK(tom_audio_position(a,&position));assert(position==ten_minutes);
  OK(tom_audio_test_render(a,x,32));assert(x[0]==0 && x[2]>0);
  assert(tom_audio_tone(a,32,440,.1,1000000)==TOM_BOUNDS);
  assert(tom_audio_tone(a,0,NAN,.1,1000000)==TOM_INVALID);
  assert(tom_audio_volume(a,2)==TOM_INVALID);
  tom_audio_free(a);a=NULL;

  TomSound *sound=NULL;OK(tom_audio_test_new(&a));
  assert(tom_sound_new(a,"constant.wav",16,&sound)==TOM_CAPACITY);assert(!sound);
  assert(tom_sound_new(a,"../constant.wav",100000,&sound)==TOM_INVALID);
  assert(tom_sound_new(a,"bad.wav",100000,&sound)==TOM_INVALID);
  assert(tom_sound_new(a,"nan.wav",100000,&sound)==TOM_INVALID);
  OK(tom_sound_new(a,"constant.wav",100000,&sound));
  TomSound *saved=sound;assert(tom_sound_new(a,"missing.wav",100000,&sound)==TOM_RESOURCE);assert(sound==saved);
  OK(tom_audio_sound(a,sound,0,.5,1));OK(tom_audio_pause(a,0));OK(tom_audio_test_render(a,x,4096));
  for(int i=0;i<8192;i++)assert(fabs(x[i]-.125)<0.000001);
  OK(tom_audio_sound_at(a,sound,1,1,0,999999));tom_sound_free(sound);sound=NULL;
  OK(tom_audio_test_render(a,x,4096));silence(x,4096);
  OK(tom_sound_new(a,"constant.wav",100000,&sound));tom_audio_free(a);a=NULL;tom_sound_free(sound);sound=NULL;

  // A looping accompaniment and two scheduled voices share the sample clock.
  TomSound *second=NULL;OK(tom_audio_test_new(&a));OK(tom_audio_test_new(&b));
  OK(tom_sound_new(a,"constant.wav",100000,&sound));OK(tom_sound_new(b,"constant.wav",100000,&second));
  OK(tom_audio_sound_at(a,sound,31,.2,1,0));OK(tom_audio_sound_at(b,second,31,.2,1,0));
  for(int i=0;i<16;i++) {
    OK(tom_audio_tone_at(a,0,220,.1,10000000,i*2048));OK(tom_audio_tone_at(b,0,220,.1,10000000,i*2048));
    OK(tom_audio_tone_at(a,1,440,.1,10000000,i*2048));OK(tom_audio_tone_at(b,1,440,.1,10000000,i*2048));
  }
  OK(tom_audio_pause(a,0));OK(tom_audio_pause(b,0));
  for(int block=0;block<8;block++) {
    OK(tom_audio_test_render(a,x,4096));int offset=0;
    while(offset<4096){int n=offset%503+1;if(n>4096-offset)n=4096-offset;OK(tom_audio_test_render(b,y+offset*2,n));offset+=n;}
    assert(!memcmp(x,y,sizeof(x)));
  }
  OK(tom_audio_channel_volume(a,31,.5));OK(tom_audio_volume(a,.5));
  OK(tom_audio_test_render(a,x,4096));for(int i=0;i<8192;i++)assert(fabs(x[i]-.0125)<0.000001);
  tom_sound_free(sound);tom_sound_free(second);tom_audio_free(a);tom_audio_free(b);
}
static SDL_WindowID window_id(void) { int count;SDL_Window **windows=SDL_GetWindows(&count);assert(count>0);SDL_WindowID id=SDL_GetWindowID(windows[0]);SDL_free(windows);return id; }
static void push_key(SDL_WindowID window,SDL_EventType kind,SDL_Scancode scan,SDL_Keycode key,int repeat,uint64_t time) {
  SDL_Event e;SDL_zero(e);e.type=kind;e.key.windowID=window;e.key.scancode=scan;e.key.key=key;e.key.repeat=repeat;e.key.down=kind==SDL_EVENT_KEY_DOWN;e.key.timestamp=time;assert(SDL_PushEvent(&e));
}
static void receive(TomWindow *window,TomEvent *event) {
  int32_t available=0;
  // SDL's poll sentinel can precede an event pushed after the previous poll.
  for(int i=0;i<3 && !available;i++)OK(tom_event_poll(window,event,&available));
  assert(available);
}
static void ui_tests(void) {
  TomWindow *w=NULL,*other=NULL;TomEvent *event=NULL;TomFont *font=NULL;TomVisual *glyph=NULL;int32_t available,value;int64_t time;
  OK(tom_window_new("Tom 0.3 test",480,320,&w));OK(tom_event_new(&event));
  do {OK(tom_event_poll(w,event,&available));}while(available);
  OK(tom_window_events(w,1));SDL_WindowID id=window_id();
  push_key(id,SDL_EVENT_KEY_DOWN,SDL_SCANCODE_E,SDLK_E,0,111);
  receive(w,event);OK(tom_event_time(event,&time));assert(time==111);
  OK(tom_event_field(event,9,&value));assert(value==SDL_SCANCODE_E);OK(tom_key_held(w,SDL_SCANCODE_E,&value));assert(value);
  push_key(id,SDL_EVENT_KEY_DOWN,SDL_SCANCODE_A,SDLK_A,0,112);
  receive(w,event);OK(tom_key_held(w,SDL_SCANCODE_E,&value));assert(value);OK(tom_key_held(w,SDL_SCANCODE_A,&value));assert(value);
  push_key(id,SDL_EVENT_KEY_DOWN,SDL_SCANCODE_E,SDLK_E,1,113);
  receive(w,event);OK(tom_event_field(event,8,&value));assert(value==1);
  push_key(id,SDL_EVENT_KEY_UP,SDL_SCANCODE_E,SDLK_E,0,114);
  receive(w,event);OK(tom_event_field(event,0,&value));assert(value==7);OK(tom_key_held(w,SDL_SCANCODE_E,&value));assert(!value);
  SDL_Event lost;SDL_zero(lost);lost.type=SDL_EVENT_WINDOW_FOCUS_LOST;lost.window.windowID=id;assert(SDL_PushEvent(&lost));
  receive(w,event);OK(tom_event_field(event,0,&value));assert(value==8);OK(tom_key_held(w,SDL_SCANCODE_A,&value));assert(!value);
  OK(tom_window_events(w,0));push_key(id,SDL_EVENT_KEY_UP,SDL_SCANCODE_A,SDLK_A,0,115);
  OK(tom_event_poll(w,event,&available));assert(!available);
  tom_test_time_set(1000);OK(tom_event_until(w,event,1000000,&available));assert(!available);OK(tom_time_now(&time));assert(time==1000000);tom_test_time_set(-1);

  OK(tom_font_file("tom/Bravura.otf",48,&font));OK(tom_visual_glyph(w,font,0xe0a4,&glyph));
  OK(tom_visual_metric(glyph,0,&value));assert(value>0);
  int64_t baseline=tom_live_objects();
  for(int i=0;i<100;i++) { OK(tom_window_clear(w,0xeeeeeeff));OK(tom_draw_line(w,20,100,460,100,1,0x111111ff));OK(tom_draw_ellipse(w,40.5+i,160,8,6,0x0077ccff));OK(tom_draw_visual(w,glyph,40.5+i,100,0x111111ff));OK(tom_window_present(w));assert(tom_live_objects()==baseline); }
  OK(tom_window_new("Other",100,100,&other));assert(tom_draw_visual(other,glyph,20,20,0xffffffff)==TOM_RESOURCE);
  do {OK(tom_event_poll(w,event,&available));}while(available);
  int count;SDL_Window **all=SDL_GetWindows(&count);SDL_WindowID other_id=0;
  for(int i=0;i<count;i++)if(SDL_GetWindowID(all[i])!=id)other_id=SDL_GetWindowID(all[i]);SDL_free(all);assert(other_id);
  OK(tom_window_events(other,1));
  push_key(other_id,SDL_EVENT_KEY_DOWN,SDL_SCANCODE_C,SDLK_C,0,121);receive(w,event);
  OK(tom_key_held(other,SDL_SCANCODE_C,&value));assert(value);OK(tom_key_held(w,SDL_SCANCODE_C,&value));assert(!value);
  push_key(other_id,SDL_EVENT_KEY_UP,SDL_SCANCODE_C,SDLK_C,0,122);receive(w,event);
  OK(tom_event_field(event,0,&value));assert(value==7);OK(tom_key_held(other,SDL_SCANCODE_C,&value));assert(!value);
  tom_window_free(other);
  assert(SDL_SetWindowSize(SDL_GetWindowFromID(id),960,640));SDL_PumpEvents();OK(tom_draw_visual(w,glyph,100,100,0x111111ff));
  tom_font_free(font);tom_event_free(event);tom_window_free(w);
  assert(tom_draw_visual(w,glyph,20,20,0xffffffff)==TOM_RESOURCE);tom_visual_free(glyph);
}
static void device_tests(void) {
  TomAudio *a=NULL;TomWindow *w=NULL;int64_t first,next;
  OK(tom_audio_new(&a));OK(tom_audio_tone(a,0,440,.05,100000000));OK(tom_audio_pause(a,0));
  OK(tom_window_new("Independent lifetime",100,100,&w));tom_window_free(w);
  SDL_Delay(40);OK(tom_audio_position(a,&first));SDL_Delay(40);OK(tom_audio_position(a,&next));assert(next>first);OK(tom_audio_check(a));tom_audio_free(a);
}
int main(void) { audio_tests();assert(tom_live_objects()==0);ui_tests();assert(tom_live_objects()==0);device_tests();assert(tom_live_objects()==0);puts("multimedia-ok");return 0; }
