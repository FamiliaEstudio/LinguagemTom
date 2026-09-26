#include "document.h"
#define SDL_MAIN_HANDLED
#include <SDL3/SDL.h>
#include <sqlite3.h>
#include <assert.h>
#include <stdio.h>
#include <string.h>
#define OK(x) assert((x)==TOM_OK)
static int drain(TomDocumentStore *s){int64_t busy=1;int error=0;uint64_t end=SDL_GetTicks()+10000;while(busy){int32_t available;OK(tom_document_store_poll(s,&available));if(available&&tom_document_store_check(s))error=tom_document_store_check(s);OK(tom_document_store_field(s,0,&busy));assert(SDL_GetTicks()<end);SDL_Delay(1);}return error;}
static void expected(const char *file,const char *sql,const char *text){sqlite3 *db=NULL;sqlite3_stmt *q=NULL;assert(sqlite3_open(file,&db)==SQLITE_OK);assert(sqlite3_prepare_v2(db,sql,-1,&q,NULL)==SQLITE_OK);assert(sqlite3_step(q)==SQLITE_ROW);assert(!strcmp((const char*)sqlite3_column_text(q,0),text));sqlite3_finalize(q);sqlite3_close(db);}
int main(int argc,char **argv){assert(argc==2);const char *file=argv[1];TomDocument *d=NULL;TomDocumentStore *s=NULL;TomText *context=NULL;int32_t dirty;int64_t field;
 OK(tom_document_new("",67108864,134217728,&d));OK(tom_text_dynamic_new("",1048576,&context));OK(tom_document_store_open(file,1,d,&s));
 expected(file,"SELECT versao FROM tom_editor_meta","2");assert(!strcmp(d->state.text->data,"antigo"));OK(tom_document_store_context(s,context));assert(!strcmp(context->data,"{}"));
 OK(tom_document_store_context_set(s,"{\"persona\":\"Eric\"}"));OK(tom_document_store_submit(s,1));OK(tom_document_store_context_set(s,"{\"persona\":\"Teodoro\"}"));OK(drain(s));
 expected(file,"SELECT contexto FROM tom_editor_documentos","{\"persona\":\"Eric\"}");OK(tom_document_store_dirty(s,&dirty));assert(dirty);
 OK(tom_document_store_tick(s,100));OK(tom_document_store_tick(s,2000000100));OK(drain(s));expected(file,"SELECT contexto FROM tom_editor_recuperacoes","{\"persona\":\"Teodoro\"}");tom_document_store_free(s);s=NULL;
 OK(tom_document_store_open(file,1,d,&s));OK(tom_document_store_field(s,8,&field));assert(field==1);OK(tom_document_store_recover(s));OK(tom_document_store_context(s,context));assert(!strcmp(context->data,"{\"persona\":\"Teodoro\"}"));OK(tom_document_store_dirty(s,&dirty));assert(dirty);OK(tom_document_store_submit(s,1));OK(drain(s));OK(tom_document_store_dirty(s,&dirty));assert(!dirty);
 sqlite3 *db=NULL;assert(sqlite3_open(file,&db)==SQLITE_OK);assert(sqlite3_exec(db,"CREATE TRIGGER refuse BEFORE UPDATE ON tom_editor_documentos WHEN json_extract(new.contexto,'$.fail')=1 BEGIN SELECT raise(ABORT,'falha deliberada'); END",NULL,NULL,NULL)==SQLITE_OK);sqlite3_close(db);
 OK(tom_document_store_context_set(s,"{\"fail\":1}"));OK(tom_document_select(d,d->state.count,d->state.count));OK(tom_document_insert(d," novo"));OK(tom_document_store_submit(s,1));assert(drain(s));assert(!strcmp(d->state.text->data,"antigo novo"));OK(tom_document_store_context(s,context));assert(!strcmp(context->data,"{\"fail\":1}"));expected(file,"SELECT contexto FROM tom_editor_documentos","{\"persona\":\"Teodoro\"}");expected(file,"SELECT texto FROM tom_editor_documentos","antigo");assert(tom_document_store_context_set(s,"[]")==TOM_INVALID);
 tom_document_store_free(s);tom_document_free(d);tom_text_free(context);assert(!tom_live_objects());puts("context-ok");return 0;
}
