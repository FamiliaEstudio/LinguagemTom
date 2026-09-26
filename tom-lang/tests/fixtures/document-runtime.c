#include "document.h"
#include <assert.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <utf8proc.h>
#define OK(x) do{int e=(x);if(e){fprintf(stderr,"line %d error %d\n",__LINE__,e);abort();}}while(0)
static TomText *json(TomDocument *d){TomText *t=NULL;OK(tom_text_dynamic_new("",67108864,&t));OK(tom_document_serialize(d,t));return t;}
static void equal(TomDocument *d,const char *s){assert(!strcmp(d->state.text->data,s));}
static void unicode_tests(const char *file){
 FILE *f=fopen(file,"rb");assert(f);char line[8192];int cases=0;
 while(fgets(line,sizeof(line),f)){
  if(line[0]=='#'||line[0]=='\n'||line[0]=='\r')continue;
  char *comment=strchr(line,'#');if(comment)*comment=0;
  char text[2048]={0};unsigned char boundaries[512]={0};int count=0,bytes=0;
  for(char *p=strtok(line," \t\r\n");p;p=strtok(NULL," \t\r\n")){
   if(!strcmp(p,"÷")){boundaries[count]=1;continue;}if(!strcmp(p,"×")){boundaries[count]=0;continue;}
   int cp=(int)strtol(p,NULL,16);bytes+=(int)utf8proc_encode_char(cp,(utf8proc_uint8_t*)text+bytes);count++;
  }
  if(!count)continue;
  /* The editor normalizes CR/LF on import. Test the unmodified Unicode stream
     through the exact stateful routine used by the document index as well. */
  int32_t previous=0,state=0;int offset=0;
  for(int i=0;i<count;i++){int32_t cp;int n=(int)utf8proc_iterate((utf8proc_uint8_t*)text+offset,bytes-offset,&cp);assert(n>0);assert((!i||utf8proc_grapheme_break_stateful(previous,cp,&state))==boundaries[i]);previous=cp;offset+=n;}
  assert(boundaries[count]);
  if(!memchr(text,'\r',(size_t)bytes)&&!memchr(text,0,(size_t)bytes)){
   TomDocument *d=NULL;OK(tom_document_new(text,4096,65536,&d));assert(d->state.count==(uint32_t)count);assert(!memcmp(boundaries,d->state.boundaries,(size_t)count+1));tom_document_free(d);
  }
  cases++;
 }
 fclose(f);assert(cases>700);printf("unicode-cases=%d\n",cases);
}
static void edits(void){
 TomDocument *d=NULL;OK(tom_document_new("a\r\né👩🏽‍💻🇧🇷",4096,65536,&d));equal(d,"a\né👩🏽‍💻🇧🇷");
 assert(tom_document_select(d,3,3)==TOM_BOUNDS);assert(tom_document_select(d,100,100)==TOM_BOUNDS);
 OK(tom_document_select(d,d->state.count,d->state.count));OK(tom_document_delete_previous(d));equal(d,"a\né👩🏽‍💻");OK(tom_document_undo(d));equal(d,"a\né👩🏽‍💻🇧🇷");
 OK(tom_document_select(d,4,4));OK(tom_document_delete_next(d));equal(d,"a\né🇧🇷");OK(tom_document_undo(d));OK(tom_document_redo(d));equal(d,"a\né🇧🇷");
 OK(tom_document_select(d,4,2));OK(tom_document_insert(d,"é"));equal(d,"a\né🇧🇷");OK(tom_document_undo(d));assert(d->state.anchor==4&&d->state.cursor==2);
 tom_document_free(d);d=NULL;
 OK(tom_document_new("",4096,65536,&d));OK(tom_document_type(d,"a",1));OK(tom_document_type(d,"b",999999999));OK(tom_document_type(d,"c",1000000000));equal(d,"abc");OK(tom_document_undo(d));equal(d,"");OK(tom_document_redo(d));equal(d,"abc");
 OK(tom_document_type(d,"d",3000000000));OK(tom_document_undo(d));equal(d,"abc");OK(tom_document_insert(d,"e"));OK(tom_document_redo(d));equal(d,"abce");
 OK(tom_document_select(d,0,4));OK(tom_document_format(d,0,1));assert(d->state.run_count==1);int32_t style;OK(tom_document_style(d,0,&style));assert(style==1);
 TomText *before=json(d);OK(tom_document_select(d,1,3));OK(tom_document_format(d,1,1));assert(d->state.run_count==3);OK(tom_document_undo(d));TomText *after=json(d);assert(!strcmp(before->data,after->data));tom_text_free(before);tom_text_free(after);
 OK(tom_document_redo(d));OK(tom_document_select(d,0,4));OK(tom_document_style(d,1,&style));assert(style==-1);
 before=json(d);TomDocument *other=NULL;OK(tom_document_new("old",4096,65536,&other));OK(tom_document_load(other,before->data));after=json(other);assert(!strcmp(before->data,after->data));tom_text_free(after);
 assert(tom_document_load(other,"{\"formato\":\"TomDocumento\",\"versao\":2}")==TOM_INVALID);after=json(other);assert(!strcmp(before->data,after->data));tom_text_free(before);tom_text_free(after);tom_document_free(other);tom_document_free(d);d=NULL;
 OK(tom_document_new("ab\ncd\nef",4096,65536,&d));OK(tom_document_select(d,3,3));OK(tom_document_format(d,4,2));OK(tom_document_select(d,6,6));OK(tom_document_format(d,4,1));before=json(d);
 OK(tom_document_select(d,1,5));OK(tom_document_insert(d,"X\nY"));equal(d,"aX\nY\nef");assert(d->state.paragraphs[1].value==0&&d->state.paragraphs[2].value==1);OK(tom_document_undo(d));after=json(d);assert(!strcmp(before->data,after->data));tom_text_free(before);tom_text_free(after);tom_document_free(d);d=NULL;
 OK(tom_document_new("eX",4096,65536,&d));OK(tom_document_select(d,1,2));OK(tom_document_format(d,0,1));OK(tom_document_select(d,1,1));before=json(d);OK(tom_document_insert(d,"́"));assert(d->state.runs[0].pos==2);OK(tom_document_undo(d));after=json(d);assert(!strcmp(before->data,after->data));tom_text_free(before);tom_text_free(after);tom_document_free(d);
}
static void failures(void){
 for(int mode=0;mode<4;mode++)for(int n=0;n<40;n++){
  TomDocument *d=NULL;OK(tom_document_new("Original\né é",4096,65536,&d));OK(tom_document_select(d,0,8));OK(tom_document_format(d,0,1));OK(tom_document_select(d,2,4));TomText *before=json(d);uint64_t anchor=d->state.anchor,cursor=d->state.cursor,history=d->history_bytes,id=d->state.id;
  tom_document_test_fail_after(n);int error=mode==0?tom_document_insert(d,"foo\nbar"):mode==1?tom_document_format(d,3,24):mode==2?tom_document_undo(d):tom_document_load(d,before->data);tom_document_test_fail_after(-1);
  if(error){assert(error==TOM_MEMORY);TomText *after=json(d);assert(!strcmp(before->data,after->data));assert(d->state.anchor==anchor&&d->state.cursor==cursor&&d->history_bytes==history&&d->state.id==id);tom_text_free(after);}
  tom_text_free(before);tom_document_free(d);
 }
 TomDocument *d=NULL;OK(tom_document_new("123",4,65536,&d));assert(tom_document_insert(d,"X")==TOM_CAPACITY);equal(d,"123");assert(tom_document_insert(d,"\xc0\xaf")==TOM_INVALID);equal(d,"123");tom_document_free(d);d=NULL;
 OK(tom_document_new("",4096,1,&d));assert(tom_document_insert(d,"X")==TOM_CAPACITY);equal(d,"");tom_document_free(d);
}
static void random_edits(void){
 TomDocument *d=NULL;OK(tom_document_new("a\nb\nc",4096,4000000,&d));unsigned seed=42;
 for(int i=0;i<300;i++){
  seed=seed*1664525u+1013904223u;uint32_t a=seed%(d->state.count+1);seed=seed*1664525u+1013904223u;uint32_t b=seed%(d->state.count+1);OK(tom_document_select(d,a,b));
  TomText *before=json(d);int64_t id=(int64_t)d->state.id;
  if(i%3==0)OK(tom_document_insert(d,i%2?"xy":"z\nw"));else OK(tom_document_format(d,i%2?0:4,i%2?1:i%4));
  TomText *after=json(d);
  if((int64_t)d->state.id!=id){OK(tom_document_undo(d));TomText *restored=json(d);assert(!strcmp(before->data,restored->data));tom_text_free(restored);OK(tom_document_redo(d));restored=json(d);assert(!strcmp(after->data,restored->data));tom_text_free(restored);}
  tom_text_free(before);tom_text_free(after);
 }
 tom_document_free(d);
}
int main(int argc,char **argv){assert(argc==2);unicode_tests(argv[1]);edits();failures();random_edits();assert(tom_live_objects()==0);puts("document-ok");return 0;}
