#include "document.h"
#include "file_io.h"
#define SDL_MAIN_HANDLED
#include <SDL3/SDL.h>
#include <assert.h>
#include <string.h>
#include <stdio.h>
#include <stdlib.h>
#define OK(call) do{int e=(call);if(e){fprintf(stderr,"line %d: %d\n",__LINE__,e);abort();}}while(0)
static void join(char *out,const char *dir,const char *name){sprintf(out,"%s/%s",dir,name);}
static int wait_job(TomFileJob *job){int32_t state=0;uint64_t end=SDL_GetTicks()+20000;while(!state){OK(tom_file_job_field(job,0,&state));assert(SDL_GetTicks()<end);SDL_Delay(1);}return state;}
int main(int argc,char **argv){assert(argc==2);char input[4096],output[4096];join(input,argv[1],"source.docx");join(output,argv[1],"export.docx");TomDocument *d=NULL,*slice=NULL,*r=NULL;TomText *warnings=NULL,*hash=NULL,*result=NULL;OK(tom_document_new("original",67108864,134217728,&d));OK(tom_document_new("",67108864,134217728,&r));OK(tom_document_new("",67108864,134217728,&slice));OK(tom_text_dynamic_new("",1048576,&warnings));OK(tom_text_dynamic_new("",128,&hash));OK(tom_text_dynamic_new("",268435456,&result));
 OK(tom_docx_read(input,d,warnings));assert(!strcmp(d->state.text->data,"  coração é 👩🏽‍💻\nrocha\nrochas"));assert(tom_document_style_at(d,2)&1);assert(tom_document_alignment_at(d,0)==1);assert(tom_document_style_at(d,d->state.count-1)&2);
 OK(tom_docx_write(output,d));OK(tom_docx_read(output,r,warnings));assert(!strcmp(r->state.text->data,d->state.text->data));assert(r->state.run_count==d->state.run_count);assert(!memcmp(r->state.runs,d->state.runs,d->state.run_count*sizeof(TomDocRun)));
 OK(tom_document_slice(d,2,9,slice));assert(!strcmp(slice->state.text->data,"coração"));assert(tom_document_style_at(slice,0)&1);
 join(input,argv[1],"abc.bin");OK(tom_file_write_all(input,"abc",3));OK(tom_file_hash(input,hash));assert(!strcmp(hash->data,"ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"));
 const unsigned char binary[]={0,255,1,0,128};OK(tom_file_write_all(input,binary,sizeof(binary)));join(output,argv[1],"copy.bin");OK(tom_file_copy(input,output));unsigned char *bytes=NULL;size_t size=0;OK(tom_file_read_all(output,32,&bytes,&size));assert(size==sizeof(binary)&&!memcmp(bytes,binary,size));free(bytes);assert(tom_file_read_text(input,warnings)==TOM_INVALID);
 join(input,argv[1],"invalid.docx");OK(tom_file_write_all(input,"invalid",7));assert(tom_docx_read(input,d,warnings)!=0);assert(strstr(d->state.text->data,"coração"));
 char request[16384];join(input,argv[1],"source.docx");snprintf(request,sizeof(request),"{\"operacao\":\"importar\",\"origem\":\"%s\"}",input);TomFileJob *job=NULL;OK(tom_file_job_new(request,&job));assert(wait_job(job)==1);OK(tom_file_job_result(job,result));assert(strstr(result->data,"TomDocumento"));tom_file_job_free(job);job=NULL;
 tom_document_free(d);tom_document_free(r);tom_document_free(slice);tom_text_free(warnings);tom_text_free(hash);tom_text_free(result);assert(tom_live_objects()==0);puts("files-ok");}
