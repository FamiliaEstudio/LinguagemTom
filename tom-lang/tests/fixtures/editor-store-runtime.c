#include "document.h"
#define SDL_MAIN_HANDLED
#include <SDL3/SDL.h>
#include <sqlite3.h>
#include <assert.h>
#include <stdlib.h>
#include <stdio.h>
#include <string.h>
#include "editor-metrics.h"
void tom_document_store_test_fault(int value);
#define OK(x) do{int check_result=(x);if(check_result){fprintf(stderr,"line %d error %d\n",__LINE__,check_result);abort();}}while(0)
static int64_t field(TomDocumentStore *s,int f){int64_t v;OK(tom_document_store_field(s,f,&v));return v;}
static int drain(TomDocumentStore *s){uint64_t end=SDL_GetTicks()+10000;int error=0;while(field(s,0)){int32_t available;OK(tom_document_store_poll(s,&available));if(available&&tom_document_store_check(s))error=tom_document_store_check(s);assert(SDL_GetTicks()<end);SDL_Delay(1);}return error;}
static void append(TomDocument *d,const char *text){OK(tom_document_select(d,d->state.count,d->state.count));OK(tom_document_insert(d,text));}
static void expected(const char *file,const char *sql,const char *text){sqlite3 *db=NULL;assert(sqlite3_open(file,&db)==SQLITE_OK);sqlite3_stmt *q=NULL;assert(sqlite3_prepare_v2(db,sql,-1,&q,NULL)==SQLITE_OK);assert(sqlite3_step(q)==SQLITE_ROW);assert(!strcmp((const char*)sqlite3_column_text(q,0),text));sqlite3_finalize(q);sqlite3_close(db);}
int main(int argc,char **argv){
 assert(argc==3);const char *mode=argv[1],*file=argv[2];TomDocument *d=NULL;TomDocumentStore *s=NULL;OK(tom_document_new("confirmed",67108864,134217728,&d));
 if(!strcmp(mode,"scale")){
  char *large=malloc(1024001);assert(large);memset(large,'a',1024000);large[1024000]=0;OK(tom_document_select(d,0,d->state.count));OK(tom_document_insert(d,large));free(large);
  uint64_t start=SDL_GetTicksNS();OK(tom_document_store_open(file,1,d,&s));uint64_t opened=SDL_GetTicksNS();append(d,"é");OK(tom_document_store_submit(s,1));uint64_t snapshot=SDL_GetTicksNS();OK(drain(s));uint64_t saved=SDL_GetTicksNS();tom_document_store_free(s);s=NULL;OK(tom_document_store_open(file,1,d,&s));uint64_t reopened=SDL_GetTicksNS();assert(d->state.count==1024001);for(size_t i=0;i<1024000;i++)assert(d->state.text->data[i]=='a');assert(!strcmp(d->state.text->data+1024000,"é"));
  printf("million-initial-save-ms=%.3f snapshot-ms=%.3f commit-wait-ms=%.3f reopen-ms=%.3f\n",(opened-start)/1e6,(snapshot-opened)/1e6,(saved-snapshot)/1e6,(reopened-saved)/1e6);editor_memory_report();goto done;
 }
 if(!strcmp(mode,"recover")){
  OK(tom_document_store_open(file,1,d,&s));assert(!strcmp(d->state.text->data,"confirmed saved"));assert(field(s,8)==1);OK(tom_document_store_recover(s));assert(!strcmp(d->state.text->data,"confirmed saved recovered"));int32_t dirty;OK(tom_document_dirty(d,&dirty));assert(dirty);OK(tom_document_store_submit(s,1));OK(drain(s));assert(!field(s,1));goto done;
 }
 if(!strcmp(mode,"crash")||!strcmp(mode,"crash-writing")){
  OK(tom_document_store_open(file,1,d,&s));append(d," saved");OK(tom_document_store_submit(s,1));OK(drain(s));append(d," recovered");OK(tom_document_store_submit(s,0));OK(drain(s));append(d," pending");
  if(!strcmp(mode,"crash-writing")){tom_document_store_test_fault(-1);OK(tom_document_store_submit(s,0));drain(s);abort();}
  sqlite3 *lock=NULL;assert(sqlite3_open(file,&lock)==SQLITE_OK);assert(sqlite3_exec(lock,"BEGIN IMMEDIATE",NULL,NULL,NULL)==SQLITE_OK);OK(tom_document_store_submit(s,0));SDL_Delay(30);_Exit(42);
 }
 OK(tom_document_store_open(file,1,d,&s));append(d," saved");uint64_t state=d->state.id;OK(tom_document_store_submit(s,1));append(d," newer");OK(drain(s));assert(field(s,4)==(int64_t)state);int32_t dirty;OK(tom_document_dirty(d,&dirty));assert(dirty);expected(file,"SELECT texto FROM tom_editor_documentos WHERE id=1","confirmed saved");
 OK(tom_document_store_tick(s,100));OK(tom_document_store_tick(s,1999999999));assert(!field(s,0));OK(tom_document_store_tick(s,2000000100));OK(drain(s));assert(field(s,1));expected(file,"SELECT texto FROM tom_editor_recuperacoes WHERE id=1","confirmed saved newer");
 /* Fifteen seconds triggers a snapshot during continuous writing. */
 for(int i=0;i<16;i++){append(d,"c");OK(tom_document_store_tick(s,3000000100LL+(int64_t)i*1000000000));}
 assert(field(s,0));OK(drain(s));assert(field(s,6)==(int64_t)d->generation);
 /* Two sessions loaded at the same database revision cannot silently overwrite. */
 TomDocument *other=NULL;TomDocumentStore *other_store=NULL;OK(tom_document_new("",67108864,134217728,&other));OK(tom_document_store_open(file,1,other,&other_store));OK(tom_document_store_recover(other_store));
 /* Delete and recreate twice: the visible draft sequence repeats, but the
    persistent write token must still reject the older session. */
 OK(tom_document_store_submit(s,2));OK(drain(s));append(d," latest");OK(tom_document_store_submit(s,0));OK(drain(s));append(d," again");OK(tom_document_store_submit(s,0));OK(drain(s));append(other," conflicting");OK(tom_document_store_submit(other_store,1));assert(drain(other_store)==TOM_CONFLICT);assert(strstr(other->state.text->data,"conflicting"));tom_document_store_free(other_store);tom_document_free(other);
 /* Queue replacement remains bounded and leaves manual requests ordered. */
 sqlite3 *lock=NULL;assert(sqlite3_open(file,&lock)==SQLITE_OK);assert(sqlite3_exec(lock,"BEGIN IMMEDIATE",NULL,NULL,NULL)==SQLITE_OK);
 for(int i=0;i<20;i++){append(d,".");OK(tom_document_store_submit(s,0));}
 append(d," manual");OK(tom_document_store_submit(s,1));append(d," after");OK(tom_document_store_submit(s,0));assert(sqlite3_exec(lock,"ROLLBACK",NULL,NULL,NULL)==SQLITE_OK);sqlite3_close(lock);OK(drain(s));assert(field(s,1));

 /* A busy writer reports an error but keeps the edited document alive. */
 assert(sqlite3_open(file,&lock)==SQLITE_OK);assert(sqlite3_exec(lock,"BEGIN IMMEDIATE",NULL,NULL,NULL)==SQLITE_OK);append(d," busy");OK(tom_document_store_submit(s,1));assert(drain(s)==TOM_SQLITE_BUSY);assert(strstr(d->state.text->data," busy"));assert(sqlite3_exec(lock,"ROLLBACK",NULL,NULL,NULL)==SQLITE_OK);sqlite3_close(lock);
 OK(tom_document_store_submit(s,1));OK(drain(s));assert(!field(s,1));
 /* Disk-full after SQL writes must roll back both representations. */
 expected(file,"SELECT texto=documento->>'$.texto' FROM tom_editor_documentos WHERE id=1","1");
 append(d," full");tom_document_store_test_fault(SQLITE_FULL);OK(tom_document_store_submit(s,1));assert(drain(s)!=0);assert(strstr(d->state.text->data," full"));
 sqlite3 *verify=NULL;sqlite3_stmt *row=NULL;assert(sqlite3_open(file,&verify)==SQLITE_OK);assert(sqlite3_prepare_v2(verify,"SELECT instr(texto,' full') FROM tom_editor_documentos WHERE id=1",-1,&row,NULL)==SQLITE_OK);assert(sqlite3_step(row)==SQLITE_ROW&&sqlite3_column_int(row,0)==0);sqlite3_finalize(row);sqlite3_close(verify);
 tom_document_store_free(s);s=NULL;
 OK(tom_document_store_readonly(file,1,d,&s));append(d," readonly");OK(tom_document_store_submit(s,1));assert(drain(s)==TOM_SQLITE_READONLY);assert(strstr(d->state.text->data,"readonly"));

 done:
 tom_document_store_free(s);tom_document_free(d);assert(tom_live_objects()==0);puts("store-ok");return 0;
}
