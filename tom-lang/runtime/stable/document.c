#include "document.h"
#include <utf8proc.h>
#include <yyjson.h>
#include <stdlib.h>
#include <string.h>
#include <limits.h>

#define DEFAULT_STYLE (12u << 8)
#define MINIMUM(a,b) ((a)<(b)?(a):(b))
#define MAXIMUM(a,b) ((a)>(b)?(a):(b))
typedef struct { size_t prefix, removed, added; TomDocRun *old_values,*new_values; } RunPatch;
struct TomDocChange {
  struct TomDocChange *prev,*next;
  char *removed,*added;
  uint32_t start,removed_count,added_count;
  RunPatch runs,paragraphs;
  uint64_t before_anchor,before_cursor,after_anchor,after_cursor,before_id,after_id,group,bytes;
  uint32_t before_style,after_style;
  int text_change;
};
#ifdef TOM_DOCUMENT_TEST
static int64_t fail_after=-1;
void tom_document_test_fail_after(int64_t n){fail_after=n;}
static int fail(void){if(fail_after<0)return 0;if(!fail_after){fail_after=-1;return 1;}fail_after--;return 0;}
#else
static int fail(void){return 0;}
#endif
static void *allocate(size_t n){return fail()?NULL:calloc(1,n?n:1);}
static void *duplicate(const void *p,size_t n){void *r=allocate(n);if(r&&n)memcpy(r,p,n);return r;}
static char *copy_text(const char *p,size_t n){char *r=allocate(n+1);if(r&&n)memcpy(r,p,n);return r;}
static void state_free(TomDocState *s){tom_text_free(s->text);free(s->offsets);free(s->boundaries);free(s->runs);free(s->paragraphs);memset(s,0,sizeof(*s));}
static void patch_free(RunPatch *p){free(p->old_values);free(p->new_values);}
static void change_free(TomDocChange *c){if(c){free(c->removed);free(c->added);patch_free(&c->runs);patch_free(&c->paragraphs);free(c);}}
static void history_free(TomDocument *d){TomDocChange *c=d->first;while(c){TomDocChange *n=c->next;change_free(c);c=n;}d->first=d->last=d->current=NULL;d->history_bytes=0;d->grouping=0;}
void tom_document_retain(TomDocument *d){if(d)d->references++;}
void tom_document_free(TomDocument *d){if(d&&!--d->references){history_free(d);state_free(&d->state);free(d);tom_object_released();}}

static int32_t normalize(const char *text,uint64_t limit,char **out,uint32_t *count){
  if(!tom_utf8_valid(text))return TOM_INVALID;
  size_t size=strlen(text),length=0;uint32_t chars=0;
  for(size_t i=0;i<size;i++){if(text[i]=='\r'&&text[i+1]=='\n')i++;length++;}
  if(length>=limit)return TOM_CAPACITY;
  char *r=allocate(length+1);if(!r)return TOM_MEMORY;
  for(size_t i=0,j=0;i<size;i++){
    unsigned char c=(unsigned char)text[i];
    if(c=='\r'){if(text[i+1]=='\n')i++;c='\n';}
    r[j++]=(char)c;if((c&0xc0)!=0x80)chars++;
  }
  *out=r;*count=chars;return TOM_OK;
}
/* Build indexes over three fragments, without copying the document text. */
static int32_t index_parts(const char *a,size_t na,const char *b,size_t nb,const char *c,size_t nc,uint32_t count,TomDocState *out){
  out->offsets=allocate(((size_t)count+1)*sizeof(uint32_t));
  out->boundaries=allocate((size_t)count+1);
  if(!out->offsets||!out->boundaries)return TOM_MEMORY;
  const char *parts[]={a,b,c};size_t sizes[]={na,nb,nc};
  uint32_t cp=0,bytes=0;utf8proc_int32_t previous=0,state=0;
  for(int part=0;part<3;part++)for(size_t i=0;i<sizes[part];){
    utf8proc_int32_t value;utf8proc_ssize_t n=utf8proc_iterate((const utf8proc_uint8_t*)parts[part]+i,(utf8proc_ssize_t)(sizes[part]-i),&value);
    if(n<=0||cp>=count)return TOM_INVALID;
    out->offsets[cp]=bytes;
    out->boundaries[cp]=(unsigned char)(!cp||utf8proc_grapheme_break_stateful(previous,value,&state));
    previous=value;cp++;bytes+=(uint32_t)n;i+=(size_t)n;
  }
  if(cp!=count)return TOM_INVALID;
  out->offsets[count]=bytes;out->boundaries[count]=1;out->count=count;return TOM_OK;
}
static uint32_t run_value(const TomDocRun *r,size_t n,uint64_t pos,int paragraphs){
  size_t lo=0,hi=n;
  if(paragraphs){while(lo+1<hi){size_t m=(lo+hi)/2;if(r[m].pos<=pos)lo=m;else hi=m;}return r[lo].value;}
  while(lo<hi){size_t m=(lo+hi)/2;if(r[m].pos<=pos)lo=m+1;else hi=m;}
  return r[lo<n?lo:n-1].value;
}
uint32_t tom_document_style_at(const TomDocument *d,uint64_t p){return run_value(d->state.runs,d->state.run_count,p,0);}
uint32_t tom_document_alignment_at(const TomDocument *d,uint64_t p){return run_value(d->state.paragraphs,d->state.paragraph_count,p,1);}
uint64_t tom_document_previous(const TomDocument *d,uint64_t p){if(p>d->state.count)p=d->state.count;if(p)p--;while(p&&!d->state.boundaries[p])p--;return p;}
uint64_t tom_document_next(const TomDocument *d,uint64_t p){if(p<d->state.count)p++;while(p<d->state.count&&!d->state.boundaries[p])p++;return p;}
static int word_letter(const TomDocument *d,uint64_t p){
  if(p>=d->state.count)return 0;utf8proc_int32_t cp;
  utf8proc_iterate((const utf8proc_uint8_t*)d->state.text->data+d->state.offsets[p],-1,&cp);
  utf8proc_category_t category=utf8proc_category(cp);
  return (category>=UTF8PROC_CATEGORY_LU&&category<=UTF8PROC_CATEGORY_NO);
}
static int word_part(const TomDocument *d,uint64_t p){
  if(word_letter(d,p))return 1;if(!p||p+1>=d->state.count)return 0;
  utf8proc_int32_t cp;utf8proc_iterate((const utf8proc_uint8_t*)d->state.text->data+d->state.offsets[p],-1,&cp);
  return (cp==39||cp==0x2019)&&word_letter(d,p-1)&&word_letter(d,p+1);
}
void tom_document_word_bounds(const TomDocument *d,uint64_t p,uint64_t *begin,uint64_t *end){
  if(p>=d->state.count){*begin=*end=d->state.count;return;}
  *begin=p;*end=tom_document_next(d,p);
  if(!word_part(d,p))return;
  while(*begin&&word_part(d,tom_document_previous(d,*begin)))*begin=tom_document_previous(d,*begin);
  while(*end<d->state.count&&word_part(d,*end))*end=tom_document_next(d,*end);
}
uint64_t tom_document_word(const TomDocument *d,uint64_t p,int direction){
  if(p>d->state.count)p=d->state.count;
  if(direction<0){while(p&&!word_part(d,tom_document_previous(d,p)))p=tom_document_previous(d,p);while(p&&word_part(d,tom_document_previous(d,p)))p=tom_document_previous(d,p);}
  else{while(p<d->state.count&&word_part(d,p))p=tom_document_next(d,p);while(p<d->state.count&&!word_part(d,p))p=tom_document_next(d,p);}
  return p;
}
static void push_run(TomDocRun *r,size_t *n,uint32_t end,uint32_t value){if(*n&&r[*n-1].value==value)r[*n-1].pos=end;else r[(*n)++]=(TomDocRun){end,value};}
static void copy_run_range(const TomDocState *s,TomDocRun *out,size_t *n,uint32_t begin,uint32_t end,int64_t shift){
  uint32_t start=0;
  for(size_t i=0;i<s->run_count;i++){uint32_t stop=s->runs[i].pos;if(stop>begin&&start<end)push_run(out,n,(uint32_t)((int64_t)MINIMUM(stop,end)+shift),s->runs[i].value);start=stop;if(start>=end)break;}
}
static int32_t changed_runs(const TomDocState *old,TomDocState *next,uint32_t a,uint32_t b,uint32_t added,uint32_t style){
  next->runs=allocate((old->run_count+3)*sizeof(TomDocRun));if(!next->runs)return TOM_MEMORY;
  copy_run_range(old,next->runs,&next->run_count,0,a,0);
  if(added)push_run(next->runs,&next->run_count,a+added,style);
  copy_run_range(old,next->runs,&next->run_count,b,old->count,(int64_t)added-(b-a));
  if(!next->run_count)push_run(next->runs,&next->run_count,0,style);
  /* A combining insertion can join clusters across a style boundary. The first
     codepoint's style wins, so no stored span can split a grapheme. */
  size_t n=0;uint32_t covered=0;
  for(size_t i=0;i<next->run_count;i++){
    uint32_t end=next->runs[i].pos;while(end<next->count&&!next->boundaries[end])end++;
    if(end>covered||!next->count){push_run(next->runs,&n,end,next->runs[i].value);covered=end;}
  }
  next->run_count=n;return TOM_OK;
}
static int32_t changed_paragraphs(const TomDocState *old,TomDocState *next,const char *insert,uint32_t a,uint32_t b,uint32_t added){
  size_t capacity=old->paragraph_count+1;for(const char *p=insert;*p;p++)if(*p=='\n')capacity++;
  next->paragraphs=allocate(capacity*sizeof(TomDocRun));if(!next->paragraphs)return TOM_MEMORY;
  uint32_t alignment=run_value(old->paragraphs,old->paragraph_count,a,1);
  for(size_t i=0;i<old->paragraph_count;i++)if(old->paragraphs[i].pos<=a)next->paragraphs[next->paragraph_count++]=old->paragraphs[i];else break;
  uint32_t cp=a;for(const unsigned char *p=(const unsigned char*)insert;*p;p++){if((*p&0xc0)!=0x80)cp++;if(*p=='\n')next->paragraphs[next->paragraph_count++]=(TomDocRun){cp,alignment};}
  int64_t shift=(int64_t)added-(b-a);
  for(size_t i=0;i<old->paragraph_count;i++)if(old->paragraphs[i].pos>b)next->paragraphs[next->paragraph_count++]=(TomDocRun){(uint32_t)((int64_t)old->paragraphs[i].pos+shift),old->paragraphs[i].value};
  return TOM_OK;
}
static int32_t patch_make(const TomDocRun *old,size_t no,const TomDocRun *next,size_t nn,int64_t shift,RunPatch *out){
  size_t prefix=0,suffix=0;
  while(prefix<no&&prefix<nn&&!memcmp(old+prefix,next+prefix,sizeof(*old)))prefix++;
  while(suffix<no-prefix&&suffix<nn-prefix){const TomDocRun *a=old+no-suffix-1,*b=next+nn-suffix-1;if((int64_t)a->pos+shift!=b->pos||a->value!=b->value)break;suffix++;}
  out->prefix=prefix;out->removed=no-prefix-suffix;out->added=nn-prefix-suffix;
  if(out->removed){out->old_values=duplicate(old+prefix,out->removed*sizeof(*old));if(!out->old_values)return TOM_MEMORY;}
  if(out->added){out->new_values=duplicate(next+prefix,out->added*sizeof(*old));if(!out->new_values)return TOM_MEMORY;}
  return TOM_OK;
}
static int32_t patch_apply(const TomDocRun *old,size_t n,const RunPatch *patch,int redo,int64_t shift,TomDocRun **out,size_t *count){
  size_t remove=redo?patch->removed:patch->added,add=redo?patch->added:patch->removed;
  if(patch->prefix+remove>n)return TOM_INVALID;
  *count=n-remove+add;TomDocRun *r=allocate(*count*sizeof(*r));if(!r)return TOM_MEMORY;
  memcpy(r,old,patch->prefix*sizeof(*r));
  if(add)memcpy(r+patch->prefix,redo?patch->new_values:patch->old_values,add*sizeof(*r));
  for(size_t i=patch->prefix+remove;i<n;i++){r[i-remove+add]=old[i];r[i-remove+add].pos=(uint32_t)((int64_t)old[i].pos+shift);}
  *out=r;return TOM_OK;
}
static void adopt_metadata(TomDocState *old,TomDocState *next){
  free(old->offsets);free(old->boundaries);free(old->runs);free(old->paragraphs);
  TomText *text=old->text;*old=*next;old->text=text;memset(next,0,sizeof(*next));
}
static int32_t prepare_change(TomDocument *d,TomDocState *next,TomDocChange *c,int typing,int64_t time){
  int64_t delta=(int64_t)c->added_count-c->removed_count;
  int32_t error=patch_make(d->state.runs,d->state.run_count,next->runs,next->run_count,delta,&c->runs);
  if(!error)error=patch_make(d->state.paragraphs,d->state.paragraph_count,next->paragraphs,next->paragraph_count,delta,&c->paragraphs);
  if(error)return error;
  c->bytes=sizeof(*c)+(c->removed?strlen(c->removed)+1:0)+(c->added?strlen(c->added)+1:0)+(c->runs.removed+c->runs.added+c->paragraphs.removed+c->paragraphs.added)*sizeof(TomDocRun);
  if(c->bytes>d->history_limit)return TOM_CAPACITY;
  if(d->next_id>=INT64_MAX||d->generation>=INT64_MAX||d->next_group>=INT64_MAX)return TOM_OVERFLOW;
  c->before_anchor=d->state.anchor;c->before_cursor=d->state.cursor;c->before_style=d->state.typing_style;c->before_id=d->state.id;
  c->after_anchor=next->anchor;c->after_cursor=next->cursor;c->after_style=next->typing_style;c->after_id=d->next_id+1;next->id=c->after_id;
  int grouped=typing&&d->grouping&&d->current&&d->current==d->last&&time>=d->typing_time&&time-d->typing_time<=1000000000&&c->start==d->state.cursor&&d->state.anchor==d->state.cursor&&!c->removed_count;
  if(grouped){uint64_t bytes=c->bytes;for(TomDocChange *p=d->current;p&&p->group==d->current->group;p=p->prev)bytes+=p->bytes;if(bytes>d->history_limit)grouped=0;}
  c->group=grouped?d->current->group:d->next_group+1;return TOM_OK;
}
static void commit_history(TomDocument *d,TomDocChange *c,int typing,int64_t time){
  TomDocChange *p=d->current?d->current->next:d->first;
  while(p){TomDocChange *n=p->next;d->history_bytes-=p->bytes;change_free(p);p=n;}
  if(d->current)d->current->next=NULL;else d->first=NULL;
  d->last=d->current;
  while(d->first&&d->history_bytes+c->bytes>d->history_limit){
    uint64_t group=d->first->group;
    do{p=d->first;d->first=p->next;if(d->current==p)d->current=NULL;if(d->last==p)d->last=NULL;d->history_bytes-=p->bytes;change_free(p);}while(d->first&&d->first->group==group);
    if(d->first)d->first->prev=NULL;
  }
  c->prev=d->last;if(d->last)d->last->next=c;else d->first=c;
  d->last=d->current=c;d->history_bytes+=c->bytes;d->next_id=c->after_id;d->next_group=c->group;d->generation++;d->grouping=typing;d->typing_time=time;
}
int32_t tom_document_new(const char *text,uint64_t text_limit,uint64_t history_limit,TomDocument **out){
  if(!out||!text_limit||text_limit>INT32_MAX||!history_limit||history_limit>INT32_MAX)return TOM_INVALID;
  char *normalized=NULL;uint32_t count=0;int32_t error=normalize(text,text_limit,&normalized,&count);if(error)return error;
  TomDocument *d=allocate(sizeof(*d));if(!d){free(normalized);return TOM_MEMORY;}
  error=tom_text_dynamic_new(normalized,text_limit,&d->state.text);
  if(!error)error=index_parts(normalized,strlen(normalized),"",0,"",0,count,&d->state);
  if(!error){d->state.runs=allocate(sizeof(TomDocRun));if(!d->state.runs)error=TOM_MEMORY;else{d->state.runs[0]=(TomDocRun){count,DEFAULT_STYLE};d->state.run_count=1;}}
  if(!error){size_t n=1;for(char *p=normalized;*p;p++)if(*p=='\n')n++;d->state.paragraphs=allocate(n*sizeof(TomDocRun));if(!d->state.paragraphs)error=TOM_MEMORY;else{d->state.paragraph_count=n;size_t j=1;for(uint32_t i=0;i<count;i++)if(normalized[d->state.offsets[i]]=='\n')d->state.paragraphs[j++]=(TomDocRun){i+1,0};}}
  free(normalized);
  if(error){state_free(&d->state);free(d);return error;}
  d->state.typing_style=DEFAULT_STYLE;d->state.id=d->next_id=d->saved_id=1;d->references=1;d->history_limit=history_limit;
  tom_object_acquired();tom_document_free(*out);*out=d;return TOM_OK;
}
int32_t tom_document_text(TomDocument *d,TomText *out){return d?tom_text_set(out,d->state.text->data):TOM_INVALID;}
int32_t tom_document_break_group(TomDocument *d){if(!d)return TOM_INVALID;d->grouping=0;return TOM_OK;}
int32_t tom_document_select(TomDocument *d,uint64_t anchor,uint64_t cursor){
  if(!d)return TOM_INVALID;if(anchor>d->state.count||cursor>d->state.count)return TOM_BOUNDS;
  if(!d->state.boundaries[anchor]||!d->state.boundaries[cursor])return TOM_BOUNDS;
  d->state.anchor=anchor;d->state.cursor=cursor;d->grouping=0;
  d->state.typing_style=tom_document_style_at(d,cursor?cursor-1:0);return TOM_OK;
}
static int32_t edit(TomDocument *d,const char *value,uint32_t a,uint32_t b,int typing,int64_t time){
  if(!d||!value)return TOM_INVALID;
  char *insert=NULL;uint32_t count;int32_t error=normalize(value,d->state.text->limit,&insert,&count);if(error)return error;
  size_t ba=d->state.offsets[a],bb=d->state.offsets[b],bytes=strlen(insert);
  if(d->state.text->length-(bb-ba)+bytes>=d->state.text->limit){free(insert);return TOM_CAPACITY;}
  if(a==b&&!count){free(insert);return TOM_OK;}
  TomDocState next={0};TomDocChange *c=allocate(sizeof(*c));if(!c){free(insert);return TOM_MEMORY;}
  c->added=insert;c->removed=copy_text(d->state.text->data+ba,bb-ba);c->start=a;c->removed_count=b-a;c->added_count=count;c->text_change=1;
  if(!c->removed)error=TOM_MEMORY;
  if(!error)error=index_parts(d->state.text->data,ba,insert,bytes,d->state.text->data+bb,(size_t)d->state.text->length-bb,d->state.count-(b-a)+count,&next);
  if(!error)error=changed_runs(&d->state,&next,a,b,count,d->state.typing_style);
  if(!error)error=changed_paragraphs(&d->state,&next,insert,a,b,count);
  next.cursor=a+count;while(next.cursor<next.count&&!next.boundaries[next.cursor])next.cursor++;
  next.anchor=next.cursor;next.typing_style=d->state.typing_style;
  if(!error)error=prepare_change(d,&next,c,typing,time);
  /* tom_text_substitute validates and reserves before touching the content. */
  if(!error)error=tom_text_substitute(d->state.text,a,b-a,insert);
  if(error){state_free(&next);change_free(c);return error;}
  adopt_metadata(&d->state,&next);commit_history(d,c,typing,time);d->damage_start=a;d->damage_old_end=b;d->damage_new_end=a+count;return TOM_OK;
}
int32_t tom_document_insert(TomDocument *d,const char *text){return d?edit(d,text,(uint32_t)MINIMUM(d->state.anchor,d->state.cursor),(uint32_t)MAXIMUM(d->state.anchor,d->state.cursor),0,0):TOM_INVALID;}
int32_t tom_document_type(TomDocument *d,const char *text,int64_t time){if(!d||time<0)return TOM_INVALID;return edit(d,text,(uint32_t)MINIMUM(d->state.anchor,d->state.cursor),(uint32_t)MAXIMUM(d->state.anchor,d->state.cursor),1,time);}
static int32_t delete_text(TomDocument *d,int forward){if(!d)return TOM_INVALID;uint64_t a=MINIMUM(d->state.anchor,d->state.cursor),b=MAXIMUM(d->state.anchor,d->state.cursor);if(a==b){if(forward)b=tom_document_next(d,b);else a=tom_document_previous(d,a);}return edit(d,"",(uint32_t)a,(uint32_t)b,0,0);}
int32_t tom_document_delete_previous(TomDocument *d){return delete_text(d,0);}
int32_t tom_document_delete_next(TomDocument *d){return delete_text(d,1);}
int32_t tom_document_selection_text(TomDocument *d,TomText *out){return d?tom_text_slice(out,d->state.text->data,MINIMUM(d->state.anchor,d->state.cursor),MAXIMUM(d->state.anchor,d->state.cursor)-MINIMUM(d->state.anchor,d->state.cursor)):TOM_INVALID;}
static int32_t state_clone(const TomDocState *s,TomDocState *out){
  *out=*s;out->text=NULL;out->offsets=NULL;out->boundaries=NULL;out->runs=NULL;out->paragraphs=NULL;
  int32_t error=tom_text_dynamic_new(s->text->data,s->text->limit,&out->text);
  if(error)return error;
  out->offsets=duplicate(s->offsets,((size_t)s->count+1)*sizeof(uint32_t));out->boundaries=duplicate(s->boundaries,(size_t)s->count+1);
  out->runs=duplicate(s->runs,s->run_count*sizeof(TomDocRun));out->paragraphs=duplicate(s->paragraphs,s->paragraph_count*sizeof(TomDocRun));
  return out->offsets&&out->boundaries&&out->runs&&out->paragraphs?TOM_OK:TOM_MEMORY;
}
static int32_t history_apply(TomDocState *s,const TomDocChange *c,int redo){
  TomDocState next={0};uint32_t removed=redo?c->removed_count:c->added_count,added=redo?c->added_count:c->removed_count;
  int64_t shift=(int64_t)added-removed;int32_t error;
  const char *text=redo?c->added:c->removed;
  if(c->text_change){size_t a=s->offsets[c->start],b=s->offsets[c->start+removed];error=index_parts(s->text->data,a,text,strlen(text),s->text->data+b,(size_t)s->text->length-b,s->count-removed+added,&next);}
  else{next.count=s->count;next.offsets=duplicate(s->offsets,((size_t)s->count+1)*sizeof(uint32_t));next.boundaries=duplicate(s->boundaries,(size_t)s->count+1);error=next.offsets&&next.boundaries?TOM_OK:TOM_MEMORY;}
  if(!error)error=patch_apply(s->runs,s->run_count,&c->runs,redo,shift,&next.runs,&next.run_count);
  if(!error)error=patch_apply(s->paragraphs,s->paragraph_count,&c->paragraphs,redo,shift,&next.paragraphs,&next.paragraph_count);
  if(!error&&c->text_change)error=tom_text_substitute(s->text,c->start,removed,text);
  if(error){state_free(&next);return error;}
  next.anchor=redo?c->after_anchor:c->before_anchor;next.cursor=redo?c->after_cursor:c->before_cursor;next.id=redo?c->after_id:c->before_id;next.typing_style=redo?c->after_style:c->before_style;
  adopt_metadata(s,&next);return TOM_OK;
}
static int32_t history_move(TomDocument *d,int redo){
  if(!d)return TOM_INVALID;TomDocChange *c=redo?(d->current?d->current->next:d->first):d->current;
  if(!c){d->grouping=0;return TOM_OK;}if(d->generation>=INT64_MAX)return TOM_OVERFLOW;
  TomDocState work={0};int32_t error=state_clone(&d->state,&work);uint64_t group=c->group;TomDocChange *last=d->current;
  while(!error&&c&&c->group==group){error=history_apply(&work,c,redo);last=redo?c:c->prev;c=redo?c->next:c->prev;}
  if(error){state_free(&work);return error;}
  d->damage_start=0;d->damage_old_end=d->state.count;d->damage_new_end=work.count;state_free(&d->state);d->state=work;d->current=last;d->generation++;d->grouping=0;return TOM_OK;
}
int32_t tom_document_undo(TomDocument *d){return history_move(d,0);}
int32_t tom_document_redo(TomDocument *d){return history_move(d,1);}
static uint32_t set_style(uint32_t style,int field,int value){if(field==3)return (style&255u)|((uint32_t)value<<8);return value?style|(1u<<field):style&~(1u<<field);}
static int style_value(uint32_t style,int field){return field==3?(int)(style>>8):(int)((style>>field)&1u);}
int32_t tom_document_format(TomDocument *d,int32_t field,int32_t value){
  if(!d||field<0||field>4||(field<3&&(value<0||value>1))||(field==3&&(value<8||value>72))||(field==4&&(value<0||value>3)))return TOM_INVALID;
  uint32_t a=(uint32_t)MINIMUM(d->state.anchor,d->state.cursor),b=(uint32_t)MAXIMUM(d->state.anchor,d->state.cursor);
  if(a==b&&field<4){d->state.typing_style=set_style(d->state.typing_style,field,value);d->grouping=0;return TOM_OK;}
  TomDocState next={0};TomDocChange *c=allocate(sizeof(*c));if(!c)return TOM_MEMORY;
  next.count=d->state.count;next.anchor=d->state.anchor;next.cursor=d->state.cursor;next.typing_style=d->state.typing_style;
  next.offsets=duplicate(d->state.offsets,((size_t)next.count+1)*sizeof(uint32_t));next.boundaries=duplicate(d->state.boundaries,(size_t)next.count+1);
  next.runs=allocate((d->state.run_count+2)*sizeof(TomDocRun));next.paragraphs=duplicate(d->state.paragraphs,d->state.paragraph_count*sizeof(TomDocRun));next.paragraph_count=d->state.paragraph_count;
  int32_t error=next.offsets&&next.boundaries&&next.runs&&next.paragraphs?TOM_OK:TOM_MEMORY;
  if(!error&&field==4){memcpy(next.runs,d->state.runs,d->state.run_count*sizeof(TomDocRun));next.run_count=d->state.run_count;for(size_t i=0;i<next.paragraph_count;i++){uint32_t end=i+1<next.paragraph_count?next.paragraphs[i+1].pos:next.count+1;if(end>a&&(next.paragraphs[i].pos<b||(a==b&&next.paragraphs[i].pos<=a)))next.paragraphs[i].value=(uint32_t)value;}}
  if(!error&&field<4){uint32_t start=0;for(size_t i=0;i<d->state.run_count;i++){uint32_t end=d->state.runs[i].pos,style=d->state.runs[i].value;if(start<a)push_run(next.runs,&next.run_count,MINIMUM(end,a),style);if(end>a&&start<b)push_run(next.runs,&next.run_count,MINIMUM(end,b),set_style(style,field,value));if(end>b)push_run(next.runs,&next.run_count,end,style);start=end;}next.typing_style=set_style(next.typing_style,field,value);}
  if(!error&&next.run_count==d->state.run_count&&next.paragraph_count==d->state.paragraph_count&&!memcmp(next.runs,d->state.runs,next.run_count*sizeof(TomDocRun))&&!memcmp(next.paragraphs,d->state.paragraphs,next.paragraph_count*sizeof(TomDocRun))){state_free(&next);change_free(c);d->grouping=0;return TOM_OK;}
  if(!error)error=prepare_change(d,&next,c,0,0);
  if(error){state_free(&next);change_free(c);return error;}
  adopt_metadata(&d->state,&next);commit_history(d,c,0,0);d->damage_start=a;d->damage_old_end=d->damage_new_end=b;return TOM_OK;
}
int32_t tom_document_style(TomDocument *d,int32_t field,int32_t *out){
  if(!d||!out||field<0||field>4)return TOM_INVALID;
  uint32_t a=(uint32_t)MINIMUM(d->state.anchor,d->state.cursor),b=(uint32_t)MAXIMUM(d->state.anchor,d->state.cursor);
  if(field<4&&a==b){*out=style_value(d->state.typing_style,field);return TOM_OK;}
  int result=-2;uint32_t start=0;
  const TomDocRun *runs=field==4?d->state.paragraphs:d->state.runs;size_t n=field==4?d->state.paragraph_count:d->state.run_count;
  for(size_t i=0;i<n;i++){
    uint32_t end=field==4?(i+1<n?runs[i+1].pos:d->state.count+1):runs[i].pos;if(field==4)start=runs[i].pos;
    if(end>a&&(start<b||(a==b&&start<=a))){int v=field==4?(int)runs[i].value:style_value(runs[i].value,field);if(result==-2)result=v;else if(result!=v){result=-1;break;}}start=end;
  }
  *out=result==-2?0:result;return TOM_OK;
}
int32_t tom_document_field(TomDocument *d,int32_t field,int64_t *out){
  if(!d||!out)return TOM_INVALID;
  switch(field){case 0:*out=d->state.count;break;case 1:*out=(int64_t)d->state.anchor;break;case 2:*out=(int64_t)d->state.cursor;break;case 3:*out=d->current!=NULL;break;case 4:*out=(d->current?d->current->next:d->first)!=NULL;break;case 5:*out=(int64_t)d->state.id;break;case 6:*out=(int64_t)d->generation;break;case 7:*out=(int64_t)d->history_bytes;break;default:return TOM_BOUNDS;}return TOM_OK;
}
int32_t tom_document_dirty(TomDocument *d,int32_t *out){if(!d||!out)return TOM_INVALID;*out=d->state.id!=d->saved_id;return TOM_OK;}
int32_t tom_document_mark_saved(TomDocument *d,int64_t id){if(!d||id<0||(uint64_t)id>d->next_id)return TOM_BOUNDS;d->saved_id=(uint64_t)id;return TOM_OK;}
int32_t tom_document_serialize(TomDocument *d,TomText *out){
  if(!d||!out)return TOM_INVALID;yyjson_mut_doc *json=yyjson_mut_doc_new(NULL);if(!json)return TOM_MEMORY;
  yyjson_mut_val *root=yyjson_mut_obj(json),*runs=yyjson_mut_arr(json),*paras=yyjson_mut_arr(json);
  int ok=root&&runs&&paras;
  if(ok){yyjson_mut_doc_set_root(json,root);ok=yyjson_mut_obj_add_str(json,root,"formato","TomDocumento")&&yyjson_mut_obj_add_uint(json,root,"versao",1)&&yyjson_mut_obj_add_str(json,root,"texto",d->state.text->data)&&yyjson_mut_obj_add_val(json,root,"estilos",runs)&&yyjson_mut_obj_add_val(json,root,"paragrafos",paras);}
  for(int part=0;ok&&part<2;part++){size_t n=part?d->state.paragraph_count:d->state.run_count;TomDocRun *r=part?d->state.paragraphs:d->state.runs;yyjson_mut_val *arr=part?paras:runs;
    for(size_t i=0;ok&&i<n;i++){yyjson_mut_val *item=yyjson_mut_arr(json);ok=item&&yyjson_mut_arr_add_uint(json,item,r[i].pos)&&yyjson_mut_arr_add_uint(json,item,r[i].value)&&yyjson_mut_arr_add_val(arr,item);}}
  char *text=ok?yyjson_mut_write(json,0,NULL):NULL;int32_t error=text?tom_text_set(out,text):TOM_MEMORY;free(text);yyjson_mut_doc_free(json);return error;
}
static int json_u32(yyjson_val *v,uint32_t *out){if(!yyjson_is_uint(v)||yyjson_get_uint(v)>UINT32_MAX)return 0;*out=(uint32_t)yyjson_get_uint(v);return 1;}
int32_t tom_document_load(TomDocument *d,const char *text){
  if(!d||!tom_utf8_valid(text))return TOM_INVALID;if(d->next_id>=INT64_MAX||d->generation>=INT64_MAX)return TOM_OVERFLOW;
  yyjson_doc *json=yyjson_read(text,strlen(text),0);if(!json)return TOM_INVALID;
  yyjson_val *root=yyjson_doc_get_root(json),*format=yyjson_obj_get(root,"formato"),*version=yyjson_obj_get(root,"versao"),*content=yyjson_obj_get(root,"texto");
  int32_t error=TOM_INVALID;TomDocument *fresh=NULL;
  if(!yyjson_is_obj(root)||yyjson_obj_size(root)!=5||!yyjson_is_str(format)||strcmp(yyjson_get_str(format),"TomDocumento")||yyjson_get_len(format)!=12||!yyjson_is_uint(version)||yyjson_get_uint(version)!=1||!yyjson_is_str(content)||strlen(yyjson_get_str(content))!=yyjson_get_len(content)||strchr(yyjson_get_str(content),'\r'))goto finish;
  error=tom_document_new(yyjson_get_str(content),d->state.text->limit,d->history_limit,&fresh);if(error)goto finish;
  for(int part=0;part<2;part++){
    yyjson_val *array=yyjson_obj_get(root,part?"paragrafos":"estilos");size_t n=yyjson_arr_size(array);
    if(!yyjson_is_arr(array)||!n||n>(size_t)fresh->state.count+1){error=TOM_INVALID;goto finish;}
    TomDocRun *values=allocate(n*sizeof(*values));if(!values){error=TOM_MEMORY;goto finish;}
    for(size_t i=0;i<n;i++){
      yyjson_val *item=yyjson_arr_get(array,i);uint32_t p,v;
      if(!yyjson_is_arr(item)||yyjson_arr_size(item)!=2||!json_u32(yyjson_arr_get(item,0),&p)||!json_u32(yyjson_arr_get(item,1),&v)||p>fresh->state.count||!fresh->state.boundaries[p]||(i&&p<=values[i-1].pos)){free(values);error=TOM_INVALID;goto finish;}
      if(part){if(v>3||i>=fresh->state.paragraph_count||p!=fresh->state.paragraphs[i].pos){free(values);error=TOM_INVALID;goto finish;}}
      else if((v&255)>7||(v>>8)<8||(v>>8)>72||(p==0&&fresh->state.count)||(i&&v==values[i-1].value)){free(values);error=TOM_INVALID;goto finish;}
      values[i]=(TomDocRun){p,v};
    }
    if(part){if(n!=fresh->state.paragraph_count){free(values);error=TOM_INVALID;goto finish;}free(fresh->state.paragraphs);fresh->state.paragraphs=values;}
    else{if(values[n-1].pos!=fresh->state.count){free(values);error=TOM_INVALID;goto finish;}free(fresh->state.runs);fresh->state.runs=values;fresh->state.run_count=n;}
  }
  history_free(d);state_free(&d->state);d->state=fresh->state;memset(&fresh->state,0,sizeof(fresh->state));
  d->damage_start=0;d->damage_old_end=UINT32_MAX;d->damage_new_end=d->state.count;d->state.id=++d->next_id;d->saved_id=d->state.id;d->state.typing_style=tom_document_style_at(d,0);d->generation++;error=TOM_OK;
finish:
  tom_document_free(fresh);yyjson_doc_free(json);return error;
}

int32_t tom_document_slice(TomDocument *source,uint64_t begin,uint64_t end,TomDocument *out){
 if(!source||!out||begin>end||end>source->state.count||!source->state.boundaries[begin]||!source->state.boundaries[end])return TOM_BOUNDS;
 size_t a=source->state.offsets[begin],b=source->state.offsets[end];char *part=copy_text(source->state.text->data+a,b-a);if(!part)return TOM_MEMORY;
 TomDocument *d=NULL;TomText *json=NULL;int32_t error=tom_document_new(part,out->state.text->limit,out->history_limit,&d);free(part);
 if(!error){TomDocRun *runs=allocate((source->state.run_count+1)*sizeof(*runs));if(!runs)error=TOM_MEMORY;else{
  size_t n=0;for(size_t i=0;i<source->state.run_count;i++){uint64_t stop=source->state.runs[i].pos;if(stop<=begin)continue;if(stop>end)stop=end;runs[n++]=(TomDocRun){(uint32_t)(stop-begin),source->state.runs[i].value};if(stop==end)break;}
  if(!n)runs[n++]=(TomDocRun){0,tom_document_style_at(source,begin)};free(d->state.runs);d->state.runs=runs;d->state.run_count=n;
  for(size_t i=0;i<d->state.paragraph_count;i++)d->state.paragraphs[i].value=tom_document_alignment_at(source,begin+d->state.paragraphs[i].pos);
 }}
 if(!error)error=tom_text_dynamic_new("",INT32_MAX,&json);if(!error)error=tom_document_serialize(d,json);if(!error)error=tom_document_load(out,json->data);tom_text_free(json);tom_document_free(d);return error;
}
