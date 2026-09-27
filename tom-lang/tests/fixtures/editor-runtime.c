#include "document.h"
#include "ui_internal.h"
#include <assert.h>
#include <stdio.h>
#include <string.h>
#include <stdlib.h>
#include "editor-metrics.h"
#ifdef _WIN32
#include <io.h>
#include <fcntl.h>
#endif
int32_t tom_editor_test_cache(TomEditor *editor);
#define OK(x) do{int check_result=(x);if(check_result){fprintf(stderr,"line %d error %d SDL %s\n",__LINE__,check_result,SDL_GetError());abort();}}while(0)
static void press(TomEditor *e,int key,int mods){TomEvent event={0};event.kind=3;event.key=key;event.modifiers=mods;int32_t used;OK(tom_editor_event(e,&event,&used));}
static void push(TomWindow *w,TomEvent *event,SDL_Event *native){SDL_FlushEvents(SDL_EVENT_FIRST,SDL_EVENT_LAST);assert(SDL_PushEvent(native));int32_t available;OK(tom_event_poll(w,event,&available));assert(available);}
int main(int argc,char **argv){
#ifdef _WIN32
 _setmode(_fileno(stdout),_O_BINARY);
#endif
 TomWindow *w=NULL;TomFont *font=NULL;TomDocument *d=NULL,*other=NULL;TomEditor *e=NULL,*second=NULL;TomEvent *event=NULL;TomText *text=NULL;
 OK(tom_window_new("Editor test",800,600,&w));OK(tom_font_new(12,&font));OK(tom_document_new("é abc\nsecond",67108864,134217728,&d));OK(tom_editor_new(w,d,font,&e));OK(tom_editor_area(e,10,10,760,500));OK(tom_editor_focus(e,1));OK(tom_event_new(&event));OK(tom_text_dynamic_new("",67108864,&text));
 if(argc==3&&!strcmp(argv[1],"clipboard-write-file")){FILE *input=fopen(argv[2],"rb");assert(input);char payload[16384];size_t n=fread(payload,1,sizeof(payload)-1,input);assert(!ferror(input)&&feof(input));fclose(input);payload[n]=0;OK(tom_clipboard_write(w,payload));puts("clipboard-ready");fflush(stdout);uint64_t until=SDL_GetTicks()+10000;while(SDL_GetTicks()<until){SDL_PumpEvents();SDL_Delay(5);}goto cleanup;}
 if(argc==2&&!strcmp(argv[1],"clipboard-read")){OK(tom_clipboard_read(w,text));puts(text->data);goto cleanup;}
 press(e,SDLK_RIGHT,0);assert(d->state.cursor==2);press(e,SDLK_BACKSPACE,0);assert(!strcmp(d->state.text->data," abc\nsecond"));press(e,SDLK_Z,SDL_KMOD_CTRL);assert(!strcmp(d->state.text->data,"é abc\nsecond"));
 press(e,SDLK_A,SDL_KMOD_CTRL);assert(d->state.anchor==0&&d->state.cursor==d->state.count);press(e,SDLK_C,SDL_KMOD_CTRL);OK(tom_clipboard_read(w,text));assert(!strcmp(text->data,d->state.text->data));
 OK(tom_clipboard_write(w,"colado\r\nárvore"));press(e,SDLK_V,SDL_KMOD_CTRL);assert(!strcmp(d->state.text->data,"colado\nárvore"));press(e,SDLK_Z,SDL_KMOD_CTRL);assert(!strcmp(d->state.text->data,"é abc\nsecond"));press(e,SDLK_Y,SDL_KMOD_CTRL);
 OK(tom_document_select(d,0,d->state.count));OK(tom_clipboard_write(w,""));press(e,SDLK_V,SDL_KMOD_CTRL);assert(!strcmp(d->state.text->data,"colado\nárvore")&&d->state.anchor==0&&d->state.cursor==d->state.count);
 OK(tom_document_select(d,d->state.count,d->state.count));SDL_Event native={0};native.type=SDL_EVENT_TEXT_EDITING;native.edit.windowID=SDL_GetWindowID(w->window);native.edit.text="é";native.edit.start=0;native.edit.length=1;push(w,event,&native);assert(event->kind==13);int32_t used;OK(tom_editor_event(e,event,&used));assert(used&&!strcmp(d->state.text->data,"colado\nárvore"));OK(tom_editor_draw(e));
 native=(SDL_Event){0};native.type=SDL_EVENT_TEXT_INPUT;native.text.windowID=SDL_GetWindowID(w->window);native.text.text="é";push(w,event,&native);OK(tom_editor_event(e,event,&used));assert(!strcmp(d->state.text->data,"colado\nárvoreé"));press(e,SDLK_Z,SDL_KMOD_CTRL);assert(!strcmp(d->state.text->data,"colado\nárvore"));
 TomEvent altgr={0};altgr.kind=3;altgr.key=SDLK_C;altgr.modifiers=SDL_KMOD_CTRL|SDL_KMOD_ALT;OK(tom_editor_event(e,&altgr,&used));assert(!used);altgr.modifiers=SDL_KMOD_CTRL|SDL_KMOD_MODE;OK(tom_editor_event(e,&altgr,&used));assert(!used);
 OK(tom_document_select(d,0,d->state.count));OK(tom_document_format(d,0,1));OK(tom_document_format(d,3,24));OK(tom_document_format(d,4,3));OK(tom_editor_area(e,10,10,140,180));OK(tom_editor_draw(e));int64_t lines;OK(tom_editor_field(e,1,&lines));assert(lines>=2);
 assert(tom_editor_zoom(e,49)==TOM_BOUNDS);assert(tom_editor_zoom(e,201)==TOM_BOUNDS);OK(tom_editor_zoom(e,200));int64_t zoom;OK(tom_editor_field(e,5,&zoom));assert(zoom==200);assert(d->state.count==13);OK(tom_editor_draw(e));OK(tom_editor_zoom(e,100));OK(tom_editor_field(e,5,&zoom));assert(zoom==100);
 press(e,SDLK_HOME,SDL_KMOD_CTRL);press(e,SDLK_END,0);uint64_t end=d->state.cursor;press(e,SDLK_HOME,0);assert(d->state.cursor<end);press(e,SDLK_DOWN,SDL_KMOD_SHIFT);assert(d->state.cursor>d->state.anchor);
 OK(tom_document_new("another document",4096,65536,&other));OK(tom_editor_new(w,other,font,&second));OK(tom_editor_area(second,300,10,400,180));OK(tom_editor_focus(second,1));int64_t focus;OK(tom_editor_field(e,0,&focus));assert(!focus);OK(tom_editor_field(second,0,&focus));assert(focus);
 TomEditor *duplicate=NULL;assert(tom_editor_new(w,d,font,&duplicate)==TOM_INVALID);
 /* Every incremental layout is compared against a full rebuild. */
 OK(tom_document_select(d,0,d->state.count));OK(tom_document_insert(d,"primeiro parágrafo longo, palavras e espaços.\nsegundo parágrafo\nterceiro\n"));
 OK(tom_editor_area(e,10,10,160,180));OK(tom_editor_test_cache(e));
 uint64_t left,right;tom_document_word_bounds(d,9,&left,&right);assert(left==9&&right==18);
 for(unsigned i=0;i<100;i++){
  uint64_t cp=(i*17u)%d->state.count;while(!d->state.boundaries[cp])cp++;OK(tom_document_select(d,cp,cp));
  if(i%5==0)OK(tom_document_insert(d,"á\nX"));else if(i%5==1)OK(tom_document_delete_next(d));else if(i%5==2)OK(tom_document_format(d,4,(int)(i%4)));else if(i%5==3){OK(tom_document_select(d,cp,tom_document_next(d,cp)));OK(tom_document_format(d,3,8+(int)(i%40)));}else OK(tom_document_undo(d));
  OK(tom_editor_test_cache(e));
 }
 /* Window/logical-coordinate ratios model 100%, 125%, 150% and 200%. */
 OK(tom_editor_focus(e,1));OK(tom_editor_area(e,10,10,760,500));press(e,SDLK_HOME,SDL_KMOD_CTRL);uint64_t logical_cursor=0;
 for(int scale=4;scale<=8;scale++){
  assert(SDL_SetWindowSize(w->window,800*scale/4,600*scale/4));SDL_PumpEvents();OK(tom_window_logical_size(w,800,600));
  native=(SDL_Event){0};native.type=SDL_EVENT_MOUSE_BUTTON_DOWN;native.button.windowID=SDL_GetWindowID(w->window);native.button.button=1;native.button.clicks=1;native.button.down=true;native.button.x=50.f*scale/4;native.button.y=30.f*scale/4;push(w,event,&native);assert(event->x==50&&event->y==30);OK(tom_editor_event(e,event,&used));
  if(scale==4)logical_cursor=d->state.cursor;else assert(logical_cursor==d->state.cursor);
  native.type=SDL_EVENT_MOUSE_BUTTON_UP;native.button.down=false;push(w,event,&native);OK(tom_editor_event(e,event,&used));
 }
 assert(SDL_SetWindowSize(w->window,800,600));SDL_PumpEvents();
 /* Actual SDL text events beyond the legacy 255-byte payload. */
 char *large=malloc(1024001);assert(large);memset(large,'a',1024000);large[1024000]=0;
 OK(tom_editor_focus(e,1));OK(tom_document_select(d,0,d->state.count));OK(tom_document_format(d,0,0));OK(tom_document_format(d,3,12));OK(tom_editor_area(e,10,10,760,500));
 native=(SDL_Event){0};native.type=SDL_EVENT_TEXT_INPUT;native.text.windowID=SDL_GetWindowID(w->window);native.text.text=large;
 uint64_t start=SDL_GetTicksNS();push(w,event,&native);OK(tom_event_text(event,text));assert(text->length==1024000);OK(tom_editor_event(e,event,&used));assert(d->state.count==1024000);uint64_t opened=SDL_GetTicksNS();OK(tom_editor_draw(e));uint64_t drawn=SDL_GetTicksNS();
 press(e,SDLK_HOME,SDL_KMOD_CTRL);native.text.text="á";push(w,event,&native);OK(tom_editor_event(e,event,&used));uint64_t typed=SDL_GetTicksNS();assert(d->state.count==1024001);press(e,SDLK_Z,SDL_KMOD_CTRL);assert(d->state.count==1024000);free(large);
 printf("million-layout-ms=%.3f draw-ms=%.3f edit-ms=%.3f\n",(opened-start)/1e6,(drawn-opened)/1e6,(typed-drawn)/1e6);
 start=SDL_GetTicksNS();press(e,SDLK_A,SDL_KMOD_CTRL);uint64_t selected=SDL_GetTicksNS();OK(tom_document_format(d,0,1));OK(tom_editor_draw(e));uint64_t formatted=SDL_GetTicksNS();
 OK(tom_document_select(d,0,0));OK(tom_editor_tick(e,(int64_t)SDL_GetTicksNS()));int64_t top_scroll;OK(tom_editor_field(e,2,&top_scroll));assert(top_scroll==0);TomEvent drag={0};drag.kind=4;drag.button=1;drag.x=760;drag.y=20;OK(tom_editor_event(e,&drag,&used));assert(used);drag.kind=10;drag.y=485;OK(tom_editor_event(e,&drag,&used));assert(used);drag.kind=11;OK(tom_editor_event(e,&drag,&used));OK(tom_editor_field(e,2,&top_scroll));assert(top_scroll>0&&d->state.anchor==0&&d->state.cursor==0);TomEvent wheel={0};wheel.kind=12;wheel.wheel_y=-5000;OK(tom_editor_event(e,&wheel,&used));int64_t before_scroll,after_scroll;OK(tom_editor_field(e,2,&before_scroll));assert(before_scroll>0);OK(tom_editor_area(e,10,10,760,500));OK(tom_editor_tick(e,(int64_t)SDL_GetTicksNS()));OK(tom_editor_field(e,2,&after_scroll));assert(before_scroll==after_scroll);OK(tom_editor_draw(e));uint64_t scrolled=SDL_GetTicksNS();
 OK(tom_document_serialize(d,text));assert(text->length>1024000);uint64_t serialized=SDL_GetTicksNS();
 printf("million-select-ms=%.3f format-layout-ms=%.3f scroll-draw-ms=%.3f serialize-ms=%.3f\n",(selected-start)/1e6,(formatted-selected)/1e6,(scrolled-formatted)/1e6,(serialized-scrolled)/1e6);
 TomForm *form=NULL;OK(tom_form_new(w,font,&form));OK(tom_form_area(form,10,10,300,156));OK(tom_form_load(form,"[{\"id\":\"f0\",\"rotulo\":\"0\",\"valor\":\"a\",\"opcoes\":[\"a\",\"b\"]},{\"id\":\"f1\",\"rotulo\":\"1\",\"valor\":\"a\"},{\"id\":\"f2\",\"rotulo\":\"2\",\"valor\":\"a\"},{\"id\":\"f3\",\"rotulo\":\"3\",\"valor\":\"a\"},{\"id\":\"f4\",\"rotulo\":\"4\",\"valor\":\"a\"},{\"id\":\"f5\",\"rotulo\":\"5\",\"valor\":\"a\"},{\"id\":\"f6\",\"rotulo\":\"6\",\"valor\":\"a\",\"opcoes\":[\"a\",\"b\"]},{\"id\":\"f7\",\"rotulo\":\"7\",\"valor\":\"a\"} ]"));OK(tom_form_focus(form,1));TomEvent form_event={0};form_event.kind=4;form_event.button=1;form_event.x=300;form_event.y=18;OK(tom_form_event(form,&form_event,&used));assert(used);form_event.kind=10;form_event.y=155;OK(tom_form_event(form,&form_event,&used));form_event.kind=11;OK(tom_form_event(form,&form_event,&used));OK(tom_form_area(form,10,10,300,156));form_event.kind=3;form_event.key=SDLK_RIGHT;OK(tom_form_event(form,&form_event,&used));assert(!used);form_event.kind=4;form_event.x=20;form_event.y=40;OK(tom_form_event(form,&form_event,&used));OK(tom_form_value(form,"f6",text));assert(!strcmp(text->data,"b"));OK(tom_form_value(form,"f0",text));assert(!strcmp(text->data,"a"));OK(tom_form_draw(form,(int64_t)SDL_GetTicksNS()));tom_form_free(form);
 if(argc==1)editor_memory_report();
cleanup:
 tom_editor_free(second);tom_document_free(other);tom_text_free(text);tom_event_free(event);tom_font_free(font);tom_document_free(d);tom_editor_free(e);tom_window_free(w);assert(tom_live_objects()==0);if(argc==1)puts("editor-ok");return 0;
}
