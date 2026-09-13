#include "tom_runtime.h"
#include "platform.h"
#include <assert.h>
#include <stdio.h>
#include <string.h>
int32_t tom_audio_test_new(TomAudio **out);
int32_t tom_audio_test_render(TomAudio *audio,float *samples,int32_t count);
#define OK(call) assert((call)==TOM_OK)
static void receive(TomWindow *window,TomEvent *event) {
  int32_t available=0;
  // SDL can expose its poll-cycle sentinel before a newly pushed event.
  for(int i=0;i<3 && !available;i++)OK(tom_event_poll(window,event,&available));
  assert(available);
}
static void visuals(void) {
  TomWindow *window=NULL,*other=NULL;TomFont *font=NULL;TomEvent *event=NULL;
  TomVisualCatalog *catalog=NULL,*second=NULL;int64_t id,expired;int32_t value;
  OK(tom_window_new("catalog-04",320,200,&window));OK(tom_window_new("other",320,200,&other));
  OK(tom_font_new(20,&font));OK(tom_event_new(&event));
  OK(tom_visual_catalog_new(window,1,&catalog));OK(tom_visual_catalog_new(other,1,&second));
  OK(tom_visual_catalog_text(catalog,font,"Ação %s",&id));expired=id;
  assert(tom_visual_catalog_text(catalog,font,"full",&id)==TOM_CAPACITY);assert(id==expired);
  assert(tom_visual_catalog_draw(other,catalog,id,0,0,0xffffffff)==TOM_RESOURCE);
  assert(tom_visual_catalog_metric(second,id,0,&value)==TOM_RESOURCE);
  for(int i=0;i<250;i++) {
    OK(tom_visual_catalog_replace(catalog,id,font,i%2?"Novo ♫":"%n"));
    OK(tom_visual_catalog_draw(window,catalog,id,(double)(i%100),50,0xff00ffff));
  }
  OK(tom_visual_catalog_metric(catalog,id,0,&value));assert(value>0);
  OK(tom_visual_catalog_remove(catalog,id));assert(tom_visual_catalog_metric(catalog,expired,0,&value)==TOM_RESOURCE);
  OK(tom_visual_catalog_text(catalog,font,"Reused slot",&id));assert(id!=expired);
  int count;SDL_Window **list=SDL_GetWindows(&count);Uint32 native=0;
  for(int i=0;i<count;i++)if(!strcmp(SDL_GetWindowTitle(list[i]),"catalog-04"))native=SDL_GetWindowID(list[i]);SDL_free(list);assert(native);
  SDL_FlushEvents(SDL_EVENT_FIRST,SDL_EVENT_LAST);
  SDL_Event input={0};input.motion.type=SDL_EVENT_MOUSE_MOTION;input.motion.windowID=native;input.motion.x=24;input.motion.y=30;
  assert(SDL_PushEvent(&input));OK(tom_event_poll(window,event,&value));assert(!value);
  OK(tom_window_pointer_events(window,1));
  input.motion.timestamp=123;input.motion.state=SDL_BUTTON_LMASK;assert(SDL_PushEvent(&input));
  receive(window,event);OK(tom_event_field(event,0,&value));assert(value==10);
  OK(tom_event_field(event,11,&value));assert(value==1);
  input=(SDL_Event){0};input.button.type=SDL_EVENT_MOUSE_BUTTON_UP;input.button.windowID=0;input.button.button=1;input.button.x=400;input.button.y=250;
  assert(SDL_PushEvent(&input));receive(window,event);OK(tom_event_field(event,0,&value));assert(value==11);
  OK(tom_event_field(event,7,&value));assert(value==(int32_t)native);
  OK(tom_event_field(event,11,&value));assert(value==0);
  input=(SDL_Event){0};input.window.type=SDL_EVENT_WINDOW_FOCUS_LOST;input.window.windowID=native;
  assert(SDL_PushEvent(&input));receive(window,event);OK(tom_event_field(event,0,&value));assert(value==8);
  // Native retention also protects misuse by C callers freeing the owner first.
  tom_window_free(window);assert(tom_visual_catalog_metric(catalog,id,0,&value)==TOM_RESOURCE);
  tom_visual_catalog_free(catalog);tom_visual_catalog_free(second);tom_font_free(font);tom_event_free(event);tom_window_free(other);
  assert(tom_live_objects()==0);
}
static void sounds(void) {
  TomAudio *audio=NULL,*other=NULL;TomSoundCatalog *catalog=NULL,*second=NULL;TomAudioClock clock;int64_t id,next;float samples[1024*2];
  OK(tom_audio_test_new(&audio));OK(tom_audio_test_new(&other));OK(tom_sound_catalog_new(audio,1,&catalog));OK(tom_sound_catalog_new(other,1,&second));
  OK(tom_sound_catalog_load(catalog,"constant.wav",65536,&id));next=id;
  assert(tom_sound_catalog_load(catalog,"constant.wav",65536,&next)==TOM_CAPACITY);assert(next==id);
  assert(tom_sound_catalog_play(second,id,0,.5,1)==TOM_RESOURCE);
  OK(tom_sound_catalog_at(catalog,id,0,.5,1,128));OK(tom_audio_pause(audio,0));
  OK(tom_audio_test_render(audio,samples,256));for(int i=0;i<128*2;i++)assert(samples[i]==0);assert(samples[128*2]==.125f);
  OK(tom_audio_clock(audio,&clock));assert(clock.position==256 && !clock.paused);
  OK(tom_audio_pause(audio,1));OK(tom_audio_test_render(audio,samples,1024));OK(tom_audio_clock(audio,&clock));assert(clock.position==256 && clock.paused);
  assert(tom_sound_catalog_replace(catalog,id,"absent.wav",65536)==TOM_RESOURCE);
  OK(tom_audio_pause(audio,0));OK(tom_audio_test_render(audio,samples,16));assert(samples[0]==.125f);
  OK(tom_sound_catalog_at(catalog,id,1,.5,1,600));OK(tom_sound_catalog_remove(catalog,id));
  OK(tom_audio_test_render(audio,samples,1024));for(int i=0;i<1024*2;i++)assert(samples[i]==0);
  for(int i=0;i<50;i++){OK(tom_sound_catalog_load(catalog,"constant.wav",65536,&next));assert(next!=id);OK(tom_sound_catalog_remove(catalog,next));}
  tom_audio_free(audio);tom_sound_catalog_free(catalog);tom_sound_catalog_free(second);tom_audio_free(other);assert(tom_live_objects()==0);
}
int main(void){visuals();sounds();assert(tom_peak_objects()<16);puts("runtime-04-ok");return 0;}
