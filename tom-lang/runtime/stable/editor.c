#include "document.h"
#include "ui_internal.h"
#include <utf8proc.h>
#include <stdlib.h>
#include <string.h>
#include <math.h>
#define GLYPHS 2048
#define TEXTURE_BUDGET (16u*1024u*1024u)
typedef struct {uint64_t hash,touch;uint32_t style;char *text;size_t bytes;int width,height,ascent;SDL_Texture *texture;size_t texture_bytes;} Glyph;
typedef struct {uint32_t start,end,line,style;float x,width;} Cell;
typedef struct {size_t first,count;uint32_t start,end,alignment;float y,height,ascent,width;int last;} Line;
struct TomEditor {
 TomWindow *window;TomDocument *document;TTF_Font *base,*fonts[73*8];Glyph *glyphs;
 uint64_t tick,generation,observed_generation,observed_cursor;size_t texture_bytes;Cell *cells;Line *lines;size_t cell_count,line_count;
 int x,y,width,height,focused,window_active,readonly,dragging,affinity,preferred,mouse_x,mouse_y;
 float scroll,content_height,preferred_x;TomText *composition;int composition_start,composition_length;
 int64_t last_tick,last_click;int click_x,click_y;
};
static int32_t valid(TomEditor *e){return e&&e->window&&!e->window->closed&&tom_ui_on_main()?TOM_OK:TOM_RESOURCE;}
static void glyph_clear(TomEditor *e,Glyph *g){if(g->texture){SDL_DestroyTexture(g->texture);e->texture_bytes-=g->texture_bytes;}free(g->text);memset(g,0,sizeof(*g));}
static TTF_Font *font_for(TomEditor *e,uint32_t style){
 unsigned size=style>>8,bits=style&7,index=size*8+bits;if(size<8||size>72)return NULL;
 if(!e->fonts[index]){TTF_Font *f=TTF_CopyFont(e->base);if(!f)return NULL;if(!TTF_SetFontSize(f,(float)size)){TTF_CloseFont(f);return NULL;}TTF_SetFontStyle(f,(bits&1?TTF_STYLE_BOLD:0)|(bits&2?TTF_STYLE_ITALIC:0)|(bits&4?TTF_STYLE_UNDERLINE:0));e->fonts[index]=f;}
 return e->fonts[index];
}
static uint64_t hash_text(const char *text,size_t n,uint32_t style){uint64_t h=UINT64_C(1469598103934665603)^style;for(size_t i=0;i<n;i++){h^=(unsigned char)text[i];h*=UINT64_C(1099511628211);}return h?h:1;}
static Glyph *glyph_get(TomEditor *e,const char *text,size_t n,uint32_t style,int draw){
 if(n==1&&*text=='\t'){text="    ";n=4;}
 uint64_t hash=hash_text(text,n,style);size_t slot=(size_t)(hash%GLYPHS);Glyph *g=NULL;
 for(size_t i=0;i<8;i++){Glyph *candidate=&e->glyphs[(slot+i)%GLYPHS];if(candidate->hash==hash&&candidate->style==style&&candidate->bytes==n&&!memcmp(candidate->text,text,n)){g=candidate;break;}if(!candidate->hash){g=candidate;break;}}
 if(!g){g=&e->glyphs[slot];glyph_clear(e,g);}
 TTF_Font *font=font_for(e,style);if(!font)return NULL;
 if(!g->hash){
  g->text=malloc(n+1);if(!g->text)return NULL;memcpy(g->text,text,n);g->text[n]=0;g->bytes=n;g->style=style;g->hash=hash;
  const char *display=g->text;utf8proc_int32_t cp;utf8proc_iterate((const utf8proc_uint8_t*)text,(utf8proc_ssize_t)n,&cp);
  if(n>4096||!TTF_FontHasGlyph(font,(Uint32)cp))display="□";
  if(!TTF_GetStringSize(font,display,0,&g->width,&g->height)){glyph_clear(e,g);return NULL;}g->ascent=TTF_GetFontAscent(font);
 }
 g->touch=++e->tick;
 if(draw&&!g->texture&&g->width>0){
  const char *display=g->text;utf8proc_int32_t cp;utf8proc_iterate((const utf8proc_uint8_t*)display,-1,&cp);if(n>4096||!TTF_FontHasGlyph(font,(Uint32)cp))display="□";
  SDL_Surface *surface=TTF_RenderText_Blended(font,display,0,(SDL_Color){30,34,40,255});if(!surface)return NULL;
  size_t cost=(size_t)surface->w*(size_t)surface->h*4;
  while(e->texture_bytes+cost>TEXTURE_BUDGET){Glyph *oldest=NULL;for(size_t i=0;i<GLYPHS;i++)if(e->glyphs[i].texture&&(&e->glyphs[i]!=g)&&(!oldest||e->glyphs[i].touch<oldest->touch))oldest=&e->glyphs[i];if(!oldest)break;SDL_DestroyTexture(oldest->texture);oldest->texture=NULL;e->texture_bytes-=oldest->texture_bytes;oldest->texture_bytes=0;}
  g->texture=SDL_CreateTextureFromSurface(e->window->renderer,surface);SDL_DestroySurface(surface);if(!g->texture)return NULL;g->texture_bytes=cost;e->texture_bytes+=cost;
 }
 return g;
}
static int is_space(const TomDocState *s,uint32_t cp){return cp<s->count&&(s->text->data[s->offsets[cp]]==' '||s->text->data[s->offsets[cp]]=='\t');}
static int is_newline(const TomDocState *s,uint32_t cp){return cp<s->count&&s->text->data[s->offsets[cp]]=='\n';}
static void finish_line(TomEditor *e,Cell *cells,Line *lines,size_t *n,size_t first,size_t end,uint32_t start,uint32_t stop,int last,float *y){
 TomDocState *s=&e->document->state;Line *line=&lines[(*n)++];line->first=first;line->count=end-first;line->start=start;line->end=stop;line->last=last;line->y=*y;line->alignment=tom_document_alignment_at(e->document,start);
 float origin=first<end?cells[first].x:0;line->height=16;line->ascent=12;
 for(size_t i=first;i<end;i++){cells[i].x-=origin;cells[i].line=(uint32_t)(*n-1);TTF_Font *f=font_for(e,cells[i].style);if(f){float h=(float)TTF_GetFontHeight(f)*1.2f;if(h>line->height)line->height=h;if(TTF_GetFontAscent(f)>line->ascent)line->ascent=(float)TTF_GetFontAscent(f);}}
 line->width=first<end?cells[end-1].x+cells[end-1].width:0;
 size_t visual_end=end;while(visual_end>first&&(is_space(s,cells[visual_end-1].start)||is_newline(s,cells[visual_end-1].start)))visual_end--;
 float visual_width=visual_end>first?cells[visual_end-1].x+cells[visual_end-1].width:0;
 float room=fmaxf(0,(float)e->width-20-visual_width),offset=line->alignment==1?room/2:line->alignment==2?room:0;
 size_t spaces=0;if(line->alignment==3&&!last)for(size_t i=first;i<visual_end;i++)if(s->text->data[s->offsets[cells[i].start]]==' ')spaces++;
 float extra=spaces?room/(float)spaces:0,shift=offset;
 for(size_t i=first;i<end;i++){cells[i].x+=shift;if(i<visual_end&&s->text->data[s->offsets[cells[i].start]]==' '){cells[i].width+=extra;shift+=extra;}}
 line->width+=shift;*y+=line->height;
}
static int32_t layout(TomEditor *e){
 if(e->generation==e->document->generation&&e->lines)return TOM_OK;
 TomDocState *s=&e->document->state;size_t capacity=(size_t)s->count+1;
 Cell *cells=calloc(capacity,sizeof(*cells));Line *lines=calloc(capacity,sizeof(*lines));
 if(!cells||!lines){free(cells);free(lines);return TOM_MEMORY;}
 /* Reuse unchanged paragraph/line geometry. Only one committed mutation may
    use the damage interval; batched edits, undo/load and width changes rebuild. */
 size_t n=0,nlines=0,first=0,last_break=0,tail=e->line_count;uint32_t line_start=0,stop=s->count;float x=0,y=0;
 int64_t delta=(int64_t)e->document->damage_new_end-e->document->damage_old_end;
 if(e->lines&&e->generation!=UINT64_MAX&&e->generation+1==e->document->generation&&e->document->damage_old_end!=UINT32_MAX){
  uint32_t a=e->document->damage_start,b=e->document->damage_old_end;size_t begin=0,end=0;
  while(begin+1<e->line_count&&e->lines[begin+1].start<=a)begin++;
  while(begin&&!e->lines[begin-1].last)begin--;
  end=begin;while(end+1<e->line_count&&e->lines[end+1].start<=b)end++;
  while(end+1<e->line_count&&!e->lines[end].last)end++;
  tail=end+1;n=e->lines[begin].first;nlines=begin;line_start=e->lines[begin].start;y=e->lines[begin].y;first=n;
  if(n)memcpy(cells,e->cells,n*sizeof(*cells));if(nlines)memcpy(lines,e->lines,nlines*sizeof(*lines));
  if(tail<e->line_count)stop=(uint32_t)((int64_t)e->lines[tail].start+delta);
 }
 for(uint32_t cp=line_start;cp<stop;){
  uint32_t end=(uint32_t)tom_document_next(e->document,cp),style=tom_document_style_at(e->document,cp);float width=0;
  if(!is_newline(s,cp)){Glyph *g=glyph_get(e,s->text->data+s->offsets[cp],s->offsets[end]-s->offsets[cp],style,0);if(!g){free(cells);free(lines);return TOM_RESOURCE;}width=(float)g->width;}
  if(x+width>e->width-20&&n>first&&!is_newline(s,cp)){
   size_t split=last_break>first?last_break:n;uint32_t stop=split<n?cells[split].start:cp;
   finish_line(e,cells,lines,&nlines,first,split,line_start,stop,0,&y);
   float origin=split<n?cells[split].x:x;for(size_t i=split;i<n;i++)cells[i].x-=origin;x-=origin;first=split;line_start=stop;last_break=0;
  }
  cells[n++]=(Cell){cp,end,0,style,x,width};x+=width;
  if(is_space(s,cp)||s->text->data[s->offsets[cp]]=='-')last_break=n;
  if(is_newline(s,cp)){finish_line(e,cells,lines,&nlines,first,n,line_start,end,1,&y);first=n;line_start=end;last_break=0;x=0;}
  cp=end;
 }
 if(tail==e->line_count)finish_line(e,cells,lines,&nlines,first,n,line_start,s->count,1,&y);
 else{
  size_t old_first=e->lines[tail].first,base=n,line_base=nlines;float dy=y-e->lines[tail].y;
  for(size_t i=old_first;i<e->cell_count;i++){Cell cell=e->cells[i];cell.start=(uint32_t)((int64_t)cell.start+delta);cell.end=(uint32_t)((int64_t)cell.end+delta);cell.line=(uint32_t)(line_base+cell.line-tail);cells[n++]=cell;}
  for(size_t i=tail;i<e->line_count;i++){Line line=e->lines[i];line.first=base+line.first-old_first;line.start=(uint32_t)((int64_t)line.start+delta);line.end=(uint32_t)((int64_t)line.end+delta);line.y+=dy;lines[nlines++]=line;}
  y=e->content_height+dy;
 }
 free(e->cells);free(e->lines);e->cells=cells;e->lines=lines;e->cell_count=n;e->line_count=nlines;e->content_height=y;e->generation=e->document->generation;
 float max=fmaxf(0,y-e->height+20);if(e->scroll>max)e->scroll=max;return TOM_OK;
}
static size_t line_at_y(TomEditor *e,float y){size_t lo=0,hi=e->line_count;while(lo+1<hi){size_t mid=(lo+hi)/2;if(e->lines[mid].y<=y)lo=mid;else hi=mid;}return lo;}
static size_t caret_line(TomEditor *e,uint64_t cp){
 size_t lo=0,hi=e->line_count;while(lo+1<hi){size_t mid=(lo+hi)/2;if(e->lines[mid].start<=cp)lo=mid;else hi=mid;}
 if(e->affinity&&lo&&e->lines[lo-1].end==cp&&!e->lines[lo-1].last)lo--;return lo;
}
static float caret_x(TomEditor *e,size_t row,uint64_t cp){
 Line *line=&e->lines[row];for(size_t i=line->first;i<line->first+line->count;i++){Cell *c=&e->cells[i];if(cp<=c->start)return c->x;if(cp<c->end)return c->x+c->width;}
 return line->width;
}
static uint64_t hit_line(TomEditor *e,size_t row,float x){
 Line *line=&e->lines[row];uint64_t cp=line->start;e->affinity=0;
 for(size_t i=line->first;i<line->first+line->count;i++){Cell *c=&e->cells[i];if(is_newline(&e->document->state,c->start))return c->start;if(x<c->x+c->width/2)return c->start;cp=c->end;}
 e->affinity=!line->last;return cp;
}
static void scroll_clamp(TomEditor *e){if(e->scroll<0)e->scroll=0;float max=fmaxf(0,e->content_height-e->height+20);if(e->scroll>max)e->scroll=max;}
static int32_t input_area(TomEditor *e){
 if(!e->focused||!e->window_active)return TOM_OK;
 size_t row=caret_line(e,e->document->state.cursor);Line *line=&e->lines[row];float x=(float)e->x+10+caret_x(e,row,e->document->state.cursor),y=(float)e->y+10+line->y-e->scroll;
 float wx,wy,ex,ey;if(!SDL_RenderCoordinatesToWindow(e->window->renderer,x,y,&wx,&wy)||!SDL_RenderCoordinatesToWindow(e->window->renderer,x+2,y+line->height,&ex,&ey))return TOM_RESOURCE;
 SDL_Rect rect={(int)floorf(wx),(int)floorf(wy),(int)ceilf(ex-wx),(int)ceilf(ey-wy)};
 return SDL_SetTextInputArea(e->window->window,&rect,0)?TOM_OK:TOM_RESOURCE;
}
static int32_t ensure_cursor(TomEditor *e){int32_t error=layout(e);if(error)return error;Line *line=&e->lines[caret_line(e,e->document->state.cursor)];if(line->y<e->scroll)e->scroll=line->y;if(line->y+line->height>e->scroll+e->height-20)e->scroll=line->y+line->height-e->height+20;scroll_clamp(e);e->observed_generation=e->document->generation;e->observed_cursor=e->document->state.cursor;return input_area(e);}
static void cancel_composition(TomEditor *e){if(e->composition){e->composition->length=0;e->composition->data[0]=0;}e->composition_start=e->composition_length=0;}
void tom_editor_free(TomEditor *e){
 if(!e)return;
 if(e->window->editor_focus==e){e->window->editor_focus=NULL;SDL_StopTextInput(e->window->window);}
 e->window->editor_count--;if(!e->window->editor_count&&!e->window->closed)SDL_StartTextInput(e->window->window);
 for(size_t i=0;i<GLYPHS;i++)glyph_clear(e,&e->glyphs[i]);free(e->glyphs);
 for(size_t i=0;i<73*8;i++)if(e->fonts[i])TTF_CloseFont(e->fonts[i]);TTF_CloseFont(e->base);
 free(e->cells);free(e->lines);tom_text_free(e->composition);e->document->attached=0;tom_document_free(e->document);tom_ui_window_release(e->window);free(e);tom_object_released();
}
int32_t tom_editor_new(TomWindow *window,TomDocument *doc,TomFont *font,TomEditor **out){
 if(!window||window->closed||!doc||!font||!out||!tom_ui_on_main())return TOM_RESOURCE;if(doc->attached)return TOM_INVALID;
 TomEditor *e=calloc(1,sizeof(*e));if(!e)return TOM_MEMORY;e->base=TTF_CopyFont(font->font);e->glyphs=calloc(GLYPHS,sizeof(Glyph));int32_t error=tom_text_dynamic_new("",67108864,&e->composition);
 if(!e->base||!e->glyphs||error){if(e->base)TTF_CloseFont(e->base);free(e->glyphs);tom_text_free(e->composition);free(e);return error?error:TOM_MEMORY;}
 e->document=doc;e->window=window;e->width=640;e->height=400;e->window_active=1;e->generation=UINT64_MAX;doc->attached=1;tom_document_retain(doc);tom_ui_window_retain(window);window->editor_count++;
 tom_object_acquired();tom_editor_free(*out);*out=e;return TOM_OK;
}
int32_t tom_editor_area(TomEditor *e,int32_t x,int32_t y,int32_t width,int32_t height){
 int32_t error=valid(e);if(error)return error;if(x<0||y<0||width<32||height<32||width>16384||height>16384||x>16384-width||y>16384-height)return TOM_BOUNDS;
 if(e->x==x&&e->y==y&&e->width==width&&e->height==height)return TOM_OK;
 if(e->width!=width)e->generation=UINT64_MAX;e->x=x;e->y=y;e->width=width;e->height=height;return ensure_cursor(e);
}
int32_t tom_editor_focus(TomEditor *e,int32_t focus){
 int32_t error=valid(e);if(error)return error;if(focus!=0&&focus!=1)return TOM_INVALID;
 if(focus){TomEditor *old=e->window->editor_focus;if(old&&old!=e){old->focused=0;old->dragging=0;cancel_composition(old);tom_document_break_group(old->document);}e->window->editor_focus=e;e->focused=1;if(!SDL_StartTextInput(e->window->window))return TOM_RESOURCE;return ensure_cursor(e);}
 e->focused=0;e->dragging=0;cancel_composition(e);tom_document_break_group(e->document);if(e->window->editor_focus==e){e->window->editor_focus=NULL;if(!SDL_StopTextInput(e->window->window))return TOM_RESOURCE;}return TOM_OK;
}
static int32_t selection_move(TomEditor *e,uint64_t cp,int shift){int32_t error=tom_document_select(e->document,shift?e->document->state.anchor:cp,cp);if(error)return error;cancel_composition(e);return ensure_cursor(e);}
static int32_t copy_selection(TomEditor *e,int cut){
 TomDocument *d=e->document;if(d->state.anchor==d->state.cursor)return TOM_OK;
 TomText *text=NULL;int32_t error=tom_text_dynamic_new("",d->state.text->limit,&text);if(!error)error=tom_document_selection_text(d,text);
 if(!error)error=tom_clipboard_write(e->window,text->data);
 if(!error&&cut)error=tom_document_insert(d,"");tom_text_free(text);return error;
}
static int32_t paste(TomEditor *e){TomText *text=NULL;int32_t error=tom_text_dynamic_new("",67108864,&text);if(!error)error=tom_clipboard_read(e->window,text);if(!error&&text->length)error=tom_document_insert(e->document,text->data);tom_text_free(text);return error;}
static int32_t key(TomEditor *e,const TomEvent *event,int32_t *consumed){
 TomDocument *d=e->document;int shift=(event->modifiers&SDL_KMOD_SHIFT)!=0,ctrl=(event->modifiers&SDL_KMOD_CTRL)!=0&&!(event->modifiers&(SDL_KMOD_ALT|SDL_KMOD_MODE));uint64_t cursor=d->state.cursor;int32_t error=TOM_OK;
 *consumed=1;
 if(e->readonly&&((ctrl&&(event->key==SDLK_X||event->key==SDLK_V||event->key==SDLK_Z||event->key==SDLK_Y))||event->key==SDLK_BACKSPACE||event->key==SDLK_DELETE||event->key==SDLK_RETURN))return TOM_OK;
 if(ctrl)switch(event->key){case SDLK_A:error=tom_document_select(d,0,d->state.count);return error?error:ensure_cursor(e);case SDLK_C:return copy_selection(e,0);case SDLK_X:error=copy_selection(e,1);goto changed;case SDLK_V:error=paste(e);goto changed;case SDLK_Z:error=shift?tom_document_redo(d):tom_document_undo(d);goto changed;case SDLK_Y:error=tom_document_redo(d);goto changed;default:break;}
 switch(event->key){
 case SDLK_LEFT:case SDLK_RIGHT:{int right=event->key==SDLK_RIGHT;e->preferred=0;e->affinity=0;if(!shift&&d->state.anchor!=cursor)cursor=right?(cursor>d->state.anchor?cursor:d->state.anchor):(cursor<d->state.anchor?cursor:d->state.anchor);else cursor=ctrl?tom_document_word(d,cursor,right?1:-1):right?tom_document_next(d,cursor):tom_document_previous(d,cursor);return selection_move(e,cursor,shift);}
 case SDLK_HOME:case SDLK_END:{int end=event->key==SDLK_END;e->preferred=0;if(ctrl){e->affinity=0;cursor=end?d->state.count:0;}else{Line *line=&e->lines[caret_line(e,cursor)];cursor=end?line->end:line->start;if(end&&cursor&&is_newline(&d->state,(uint32_t)cursor-1))cursor--;e->affinity=end&&!line->last;}return selection_move(e,cursor,shift);}
 case SDLK_UP:case SDLK_DOWN:case SDLK_PAGEUP:case SDLK_PAGEDOWN:{size_t row=caret_line(e,cursor);if(!e->preferred){e->preferred_x=caret_x(e,row,cursor);e->preferred=1;}int down=event->key==SDLK_DOWN||event->key==SDLK_PAGEDOWN;size_t target=row;if(event->key==SDLK_PAGEUP||event->key==SDLK_PAGEDOWN)target=line_at_y(e,e->lines[row].y+(down?1:-1)*(float)(e->height-20));else if(down&&row+1<e->line_count)target++;else if(!down&&row)target--;cursor=hit_line(e,target,e->preferred_x);return selection_move(e,cursor,shift);}
 case SDLK_BACKSPACE:error=tom_document_delete_previous(d);goto changed;
 case SDLK_DELETE:error=tom_document_delete_next(d);goto changed;
 case SDLK_RETURN:error=tom_document_insert(d,"\n");goto changed;
 case SDLK_ESCAPE:cancel_composition(e);return TOM_OK;
 default:*consumed=0;return TOM_OK;
 }
changed:
 if(error)return error;e->preferred=0;e->affinity=0;cancel_composition(e);return ensure_cursor(e);
}
int32_t tom_editor_event(TomEditor *e,TomEvent *event,int32_t *consumed){
 int32_t error=valid(e);if(error)return error;if(!event||!consumed)return TOM_INVALID;*consumed=0;
 if(event->window_id&&event->window_id!=(int32_t)SDL_GetWindowID(e->window->window))return TOM_OK;
 error=layout(e);if(error)return error;
 int inside=event->x>=e->x&&event->x<e->x+e->width&&event->y>=e->y&&event->y<e->y+e->height;
 if(event->kind==8){e->window_active=0;e->dragging=0;cancel_composition(e);tom_document_break_group(e->document);return TOM_OK;}
 if(event->kind==9){e->window_active=1;return input_area(e);}
 if(event->kind==4&&event->button==1){
  if(!inside){if(e->focused)tom_editor_focus(e,0);return TOM_OK;}
  error=tom_editor_focus(e,1);if(error)return error;*consumed=1;e->preferred=0;e->mouse_x=event->x;e->mouse_y=event->y;
  uint64_t cp=hit_line(e,line_at_y(e,(float)(event->y-e->y-10)+e->scroll),(float)(event->x-e->x-10));
  int twice=event->clicks?event->clicks>=2:(event->timestamp>e->last_click&&event->timestamp-e->last_click<400000000&&abs(event->x-e->click_x)<4&&abs(event->y-e->click_y)<4);
  e->last_click=event->timestamp;e->click_x=event->x;e->click_y=event->y;
  if(twice){uint64_t left,right;tom_document_word_bounds(e->document,cp,&left,&right);error=tom_document_select(e->document,left,right);e->dragging=0;}
  else{error=tom_document_select(e->document,(event->modifiers&SDL_KMOD_SHIFT)?e->document->state.anchor:cp,cp);e->dragging=1;}
  cancel_composition(e);return error?error:ensure_cursor(e);
 }
 if(event->kind==10&&e->dragging){*consumed=1;e->mouse_x=event->x;e->mouse_y=event->y;uint64_t cp=hit_line(e,line_at_y(e,(float)(event->y-e->y-10)+e->scroll),(float)(event->x-e->x-10));return tom_document_select(e->document,e->document->state.anchor,cp);}
 if(event->kind==11&&e->dragging){e->dragging=0;*consumed=1;return TOM_OK;}
 if(event->kind==12&&(inside||e->focused)){e->scroll-=(float)event->wheel_y*48;scroll_clamp(e);*consumed=1;return input_area(e);}
 if(!e->focused||!e->window_active)return TOM_OK;
 if(event->kind==13){*consumed=1;if(e->readonly)return TOM_OK;error=tom_text_set(e->composition,tom_ui_event_text(event));if(!error){e->composition_start=event->composition_start;e->composition_length=event->composition_length;}return error;}
 if(event->kind==2){*consumed=1;if(e->readonly)return TOM_OK;int composition=e->composition->length!=0;error=composition?tom_document_insert(e->document,tom_ui_event_text(event)):tom_document_type(e->document,tom_ui_event_text(event),event->timestamp);if(error)return error;cancel_composition(e);e->preferred=0;e->affinity=0;return ensure_cursor(e);}
 if(event->kind==3){if(e->composition->length&&event->key!=SDLK_ESCAPE){*consumed=1;return TOM_OK;}return key(e,event,consumed);}
 return TOM_OK;
}
int32_t tom_editor_tick(TomEditor *e,int64_t time){
 int32_t error=valid(e);if(error)return error;if(time<0)return TOM_INVALID;error=(e->observed_generation!=e->document->generation||e->observed_cursor!=e->document->state.cursor)?ensure_cursor(e):layout(e);if(error)return error;
 if(e->dragging&&e->last_tick&&time>=e->last_tick){float dt=fminf((float)(time-e->last_tick)/1000000000.f,.1f),velocity=0;if(e->mouse_y<e->y)velocity=(float)(e->mouse_y-e->y)*8;if(e->mouse_y>e->y+e->height)velocity=(float)(e->mouse_y-e->y-e->height)*8;e->scroll+=velocity*dt;scroll_clamp(e);if(velocity){uint64_t cp=hit_line(e,line_at_y(e,(float)(e->mouse_y-e->y-10)+e->scroll),(float)(e->mouse_x-e->x-10));error=tom_document_select(e->document,e->document->state.anchor,cp);}}
 e->last_tick=time;return error?error:input_area(e);
}
static int rect(SDL_Renderer *r,float x,float y,float w,float h,SDL_Color color){SDL_FRect area={x,y,w,h};return SDL_SetRenderDrawColor(r,color.r,color.g,color.b,color.a)&&SDL_RenderFillRect(r,&area);}
int32_t tom_editor_draw(TomEditor *e){
 int32_t error=valid(e);if(error)return error;error=layout(e);if(error)return error;
 SDL_Renderer *renderer=e->window->renderer;SDL_Rect previous;bool clipped=SDL_RenderClipEnabled(renderer);if(clipped&&!SDL_GetRenderClipRect(renderer,&previous))return TOM_RESOURCE;
 SDL_Rect area={e->x,e->y,e->width,e->height};if(clipped){SDL_Rect intersection;if(!SDL_GetRectIntersection(&area,&previous,&intersection))return TOM_OK;area=intersection;}
 if(!SDL_SetRenderClipRect(renderer,&area))return TOM_RESOURCE;
 if(!rect(renderer,(float)e->x,(float)e->y,(float)e->width,(float)e->height,(SDL_Color){255,255,255,255})){error=TOM_RESOURCE;goto done;}
 TomDocState *s=&e->document->state;uint64_t a=s->anchor<s->cursor?s->anchor:s->cursor,b=s->anchor>s->cursor?s->anchor:s->cursor;
 size_t first=line_at_y(e,e->scroll);
 for(size_t row=first;row<e->line_count;row++){
  Line *line=&e->lines[row];float y=(float)e->y+10+line->y-e->scroll;if(y>e->y+e->height)break;
  for(size_t i=line->first;i<line->first+line->count;i++){
   Cell *cell=&e->cells[i];float x=(float)e->x+10+cell->x;
   if(cell->start<b&&cell->end>a){float width=cell->width;if(width<3)width=3;if(!rect(renderer,x,y,width,line->height,e->focused?(SDL_Color){186,213,252,255}:(SDL_Color){217,221,226,255})){error=TOM_RESOURCE;goto done;}}
   if(is_newline(s,cell->start))continue;
   Glyph *glyph=glyph_get(e,s->text->data+s->offsets[cell->start],s->offsets[cell->end]-s->offsets[cell->start],cell->style,1);if(!glyph){error=TOM_RESOURCE;goto done;}
   if(glyph->texture){SDL_FRect target={x,y+line->ascent-glyph->ascent,(float)glyph->width,(float)glyph->height};if(!SDL_RenderTexture(renderer,glyph->texture,NULL,&target)){error=TOM_RESOURCE;goto done;}}
  }
 }
 if(e->focused&&e->window_active){
  size_t row=caret_line(e,s->cursor);Line *line=&e->lines[row];float x=(float)e->x+10+caret_x(e,row,s->cursor),y=(float)e->y+10+line->y-e->scroll;
  if(e->composition->length){
   Glyph *g=glyph_get(e,e->composition->data,(size_t)e->composition->length,s->typing_style,1);if(!g){error=TOM_RESOURCE;goto done;}
   TTF_Font *font=font_for(e,s->typing_style);size_t start=0,stop=0;int index=0;
   for(size_t b=0;b<(size_t)e->composition->length;){utf8proc_int32_t cp;utf8proc_ssize_t n=utf8proc_iterate((const utf8proc_uint8_t*)e->composition->data+b,-1,&cp);if(n<=0)break;b+=(size_t)n;index++;if(index<=e->composition_start)start=b;if(index<=e->composition_start+e->composition_length)stop=b;}
   if(stop<start)stop=start;int before=0,selected=0,h=0;if(start&&!TTF_GetStringSize(font,e->composition->data,start,&before,&h)){error=TOM_RESOURCE;goto done;}if(stop&&!TTF_GetStringSize(font,e->composition->data,stop,&selected,&h)){error=TOM_RESOURCE;goto done;}
   rect(renderer,x,y,(float)g->width,line->height,(SDL_Color){240,245,255,255});if(stop>start)rect(renderer,x+before,y,(float)(selected-before),line->height,(SDL_Color){174,201,244,255});
   rect(renderer,x+before,y,1.5f,line->height,(SDL_Color){30,80,160,255});SDL_FRect target={x,y+line->ascent-g->ascent,(float)g->width,(float)g->height};if(g->texture)SDL_RenderTexture(renderer,g->texture,NULL,&target);rect(renderer,x,y+line->height-2,(float)g->width,1,(SDL_Color){30,80,160,255});
  }else if((e->last_tick/500000000)%2==0)rect(renderer,x,y,1.5f,line->height,(SDL_Color){20,25,35,255});
 }
 if(e->content_height>e->height-20){float track=(float)e->height-4,thumb=fmaxf(20,track*(e->height-20)/e->content_height),y=(float)e->y+2+(track-thumb)*e->scroll/fmaxf(1,e->content_height-e->height+20);rect(renderer,(float)(e->x+e->width-6),y,4,thumb,(SDL_Color){125,135,150,255});}
 {SDL_FRect border={(float)e->x,(float)e->y,(float)e->width,(float)e->height};SDL_SetRenderDrawColor(renderer,e->focused?40:170,e->focused?100:175,e->focused?190:180,255);if(!SDL_RenderRect(renderer,&border))error=TOM_RESOURCE;}
done:
 if(!SDL_SetRenderClipRect(renderer,clipped?&previous:NULL)&&!error)error=TOM_RESOURCE;return error;
}
int32_t tom_editor_field(TomEditor *e,int32_t field,int64_t *out){int32_t error=valid(e);if(error)return error;if(!out)return TOM_INVALID;error=layout(e);if(error)return error;switch(field){case 0:*out=e->focused;break;case 1:*out=(int64_t)e->line_count;break;case 2:*out=(int64_t)e->scroll;break;case 3:*out=(int64_t)e->content_height;break;case 4:*out=(int64_t)e->texture_bytes;break;default:return TOM_BOUNDS;}return TOM_OK;}
#ifdef TOM_EDITOR_TEST
/* Differential check: incremental paragraph caches must match a fresh layout. */
int32_t tom_editor_test_cache(TomEditor *e){
 int32_t error=layout(e);if(error)return error;size_t nc=e->cell_count,nl=e->line_count;
 Cell *cells=malloc(nc*sizeof(*cells));Line *lines=malloc(nl*sizeof(*lines));if((nc&&!cells)||!lines){free(cells);free(lines);return TOM_MEMORY;}
 if(nc)memcpy(cells,e->cells,nc*sizeof(*cells));memcpy(lines,e->lines,nl*sizeof(*lines));e->generation=UINT64_MAX;error=layout(e);
 if(!error&&(nc!=e->cell_count||nl!=e->line_count))error=TOM_INVALID;
 for(size_t i=0;!error&&i<nc;i++){Cell *a=&cells[i],*b=&e->cells[i];if(a->start!=b->start||a->end!=b->end||a->line!=b->line||a->style!=b->style||fabsf(a->x-b->x)>.05f||fabsf(a->width-b->width)>.05f)error=TOM_INVALID;}
 for(size_t i=0;!error&&i<nl;i++){Line *a=&lines[i],*b=&e->lines[i];if(a->first!=b->first||a->count!=b->count||a->start!=b->start||a->end!=b->end||a->alignment!=b->alignment||a->last!=b->last||fabsf(a->y-b->y)>.05f||fabsf(a->height-b->height)>.05f)error=TOM_INVALID;}
 free(cells);free(lines);return error;
}
#endif

int32_t tom_editor_readonly(TomEditor *e,int32_t value){int32_t error=valid(e);if(error)return error;if(value!=0&&value!=1)return TOM_INVALID;e->readonly=value;return TOM_OK;}
