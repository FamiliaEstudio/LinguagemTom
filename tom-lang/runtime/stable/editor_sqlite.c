#include "document.h"
#ifdef TOM_EDITOR_STORE_TEST
#include <stdatomic.h>
static _Atomic int test_fault;
void tom_document_store_test_fault(int value){atomic_store(&test_fault,value);}
#endif
#define SDL_MAIN_HANDLED
#include <SDL3/SDL.h>
#include <sqlite3.h>
#include <yyjson.h>
#include <stdlib.h>
#include <string.h>
#include <stdio.h>
#define MANUAL_QUEUE 8
#define COMPLETIONS 32
#define CONFLICT_CODE (SQLITE_CONSTRAINT | (99<<8))
typedef struct SaveJob {
 struct SaveJob *next;char *text,*json,*context;uint64_t ticket,state,generation,context_generation;int mode;
} SaveJob;
typedef struct {uint64_t ticket,state,generation,context_generation;int mode,error,code,recovery;int64_t revision;char message[512];} SaveResult;
struct TomDocumentStore {
 sqlite3 *db;TomDocument *document;SDL_Thread *thread;SDL_Mutex *mutex;SDL_Condition *condition;
 SaveJob *first,*last;size_t queued,manuals;int active,stop,paused,await_recovery,has_recovery;
 SaveResult results[COMPLETIONS],last_result;size_t result_first,result_count;
 uint64_t next_ticket,observed_generation,scheduled_generation;int64_t observed_at,dirty_since,retry_at,last_tick;
 /* Worker-owned after startup. No Tom resources are accessed by the worker. */
 int64_t key,base_revision,draft_sequence,write_sequence;uint64_t auto_generation,manual_generation;
 char *recovery_json,*context,*recovery_context;
 uint64_t context_generation,saved_context_generation;char worker_error[512];
};
static char *copy(const char *text){size_t n=strlen(text);char *out=malloc(n+1);if(out)memcpy(out,text,n+1);return out;}
static int32_t mapped(int code){
 if(code==CONFLICT_CODE)return TOM_CONFLICT;
 switch(code&255){case SQLITE_OK:return TOM_OK;case SQLITE_NOMEM:return TOM_MEMORY;case SQLITE_TOOBIG:return TOM_CAPACITY;case SQLITE_BUSY:case SQLITE_LOCKED:return TOM_SQLITE_BUSY;case SQLITE_READONLY:return TOM_SQLITE_READONLY;case SQLITE_CONSTRAINT:return TOM_SQLITE_CONSTRAINT;default:return TOM_SQLITE;}
}
static void job_free(SaveJob *job){if(job){free(job->text);free(job->json);free(job->context);free(job);}}
static int prepare(sqlite3 *db,const char *sql,sqlite3_stmt **out){return sqlite3_prepare_v2(db,sql,-1,out,NULL);}
static int run(sqlite3 *db,const char *sql){return sqlite3_exec(db,sql,NULL,NULL,NULL);}
static int finish(sqlite3_stmt *q,int code){int end=sqlite3_finalize(q);return code==SQLITE_DONE||code==SQLITE_ROW||code==SQLITE_OK?end:code;}
static int read_versions(TomDocumentStore *s,int64_t *revision,int64_t *draft,int64_t *sequence){
 sqlite3_stmt *q=NULL;int code=prepare(s->db,"SELECT d.revisao,coalesce(r.sequencia,0),v.sequencia FROM tom_editor_documentos d JOIN tom_editor_revisoes v ON v.id=d.id LEFT JOIN tom_editor_recuperacoes r ON r.id=d.id WHERE d.id=?1",&q);
 if(code==SQLITE_OK)code=sqlite3_bind_int64(q,1,s->key);
 if(code==SQLITE_OK){code=sqlite3_step(q);if(code==SQLITE_ROW){*revision=sqlite3_column_int64(q,0);*draft=sqlite3_column_int64(q,1);*sequence=sqlite3_column_int64(q,2);}else if(code==SQLITE_DONE)code=CONFLICT_CODE;}
 return finish(q,code);
}
static int valid_context(const char *text){
 if(!text||!tom_utf8_valid(text)||strlen(text)>16777216)return 0;
 yyjson_doc *doc=yyjson_read(text,strlen(text),0);int valid=doc&&yyjson_is_obj(yyjson_doc_get_root(doc));yyjson_doc_free(doc);return valid;
}
static uint64_t generation(TomDocumentStore *s){return s->document->generation+s->context_generation;}
static int bind_snapshot(sqlite3_stmt *q,const SaveJob *job,int first){int code=sqlite3_bind_text(q,first,job->text,-1,SQLITE_TRANSIENT);if(code==SQLITE_OK)code=sqlite3_bind_text(q,first+1,job->json,-1,SQLITE_TRANSIENT);if(code==SQLITE_OK)code=sqlite3_bind_text(q,first+2,job->context,-1,SQLITE_TRANSIENT);return code;}
static int save(TomDocumentStore *s,SaveJob *job){
 int code=run(s->db,"BEGIN IMMEDIATE");if(code!=SQLITE_OK){snprintf(s->worker_error,sizeof(s->worker_error),"%s",sqlite3_errmsg(s->db));return code;}
 int64_t revision=0,draft=0,sequence=0;code=read_versions(s,&revision,&draft,&sequence);
 if(code==SQLITE_OK&&(revision!=s->base_revision||draft!=s->draft_sequence||sequence!=s->write_sequence))code=CONFLICT_CODE;
 sqlite3_stmt *q=NULL;int64_t new_revision=revision,new_draft=draft;uint64_t auto_generation=s->auto_generation,manual_generation=s->manual_generation;
 if(code==SQLITE_OK&&job->mode==0&&job->generation>auto_generation&&job->generation>manual_generation){
  if(draft==INT64_MAX)code=SQLITE_TOOBIG;
  else code=prepare(s->db,"INSERT INTO tom_editor_recuperacoes(id,revisao_base,sequencia,texto,documento,contexto) VALUES(?1,?2,?3,?4,?5,?6) ON CONFLICT(id) DO UPDATE SET revisao_base=excluded.revisao_base,sequencia=excluded.sequencia,texto=excluded.texto,documento=excluded.documento,contexto=excluded.contexto",&q);
  if(code==SQLITE_OK)code=sqlite3_bind_int64(q,1,s->key);if(code==SQLITE_OK)code=sqlite3_bind_int64(q,2,revision);if(code==SQLITE_OK)code=sqlite3_bind_int64(q,3,draft+1);if(code==SQLITE_OK)code=bind_snapshot(q,job,4);if(code==SQLITE_OK)code=sqlite3_step(q);code=finish(q,code);q=NULL;
  if(code==SQLITE_OK){new_draft=draft+1;auto_generation=job->generation;}
 }
 if(code==SQLITE_OK&&job->mode==1){
  if(revision==INT64_MAX)code=SQLITE_TOOBIG;
  else code=prepare(s->db,"UPDATE tom_editor_documentos SET revisao=revisao+1,texto=?1,documento=?2,contexto=?3 WHERE id=?4",&q);
  if(code==SQLITE_OK)code=bind_snapshot(q,job,1);if(code==SQLITE_OK)code=sqlite3_bind_int64(q,4,s->key);if(code==SQLITE_OK)code=sqlite3_step(q);code=finish(q,code);q=NULL;
  if(code==SQLITE_OK){new_revision=revision+1;manual_generation=job->generation;
   if(draft&&auto_generation>job->generation){code=prepare(s->db,"UPDATE tom_editor_recuperacoes SET revisao_base=?1 WHERE id=?2",&q);if(code==SQLITE_OK)code=sqlite3_bind_int64(q,1,new_revision);if(code==SQLITE_OK)code=sqlite3_bind_int64(q,2,s->key);}
   else{code=prepare(s->db,"DELETE FROM tom_editor_recuperacoes WHERE id=?1",&q);if(code==SQLITE_OK)code=sqlite3_bind_int64(q,1,s->key);new_draft=0;}
   if(code==SQLITE_OK)code=sqlite3_step(q);code=finish(q,code);q=NULL;
  }
 }
 if(code==SQLITE_OK&&job->mode==2){code=prepare(s->db,"DELETE FROM tom_editor_recuperacoes WHERE id=?1",&q);if(code==SQLITE_OK)code=sqlite3_bind_int64(q,1,s->key);if(code==SQLITE_OK)code=sqlite3_step(q);code=finish(q,code);q=NULL;if(code==SQLITE_OK){new_draft=0;auto_generation=0;}}
 /* This token survives deletion/recreation of recovery (prevents ABA). */
 if(code==SQLITE_OK){
  if(sequence==INT64_MAX)code=SQLITE_TOOBIG;
  else code=prepare(s->db,"UPDATE tom_editor_revisoes SET sequencia=sequencia+1 WHERE id=?1",&q);
  if(code==SQLITE_OK)code=sqlite3_bind_int64(q,1,s->key);if(code==SQLITE_OK)code=sqlite3_step(q);code=finish(q,code);q=NULL;
 }
#ifdef TOM_EDITOR_STORE_TEST
 if(code==SQLITE_OK){int fault=atomic_exchange(&test_fault,0);if(fault==-1)_Exit(43);if(fault>0)code=fault;}
#endif
 if(code==SQLITE_OK)code=run(s->db,"COMMIT");
 if(code!=SQLITE_OK){snprintf(s->worker_error,sizeof(s->worker_error),"%s",sqlite3_errmsg(s->db));run(s->db,"ROLLBACK");return code;}
 s->write_sequence=sequence+1;s->base_revision=new_revision;s->draft_sequence=new_draft;s->auto_generation=auto_generation;s->manual_generation=manual_generation;return SQLITE_OK;
}
static int worker(void *data){
 TomDocumentStore *s=data;
 for(;;){
  SDL_LockMutex(s->mutex);
  while(!s->first&&!s->stop)SDL_WaitCondition(s->condition,s->mutex);
  if(!s->first&&s->stop){SDL_UnlockMutex(s->mutex);break;}
  SaveJob *job=s->first;s->first=job->next;if(!s->first)s->last=NULL;s->queued--;if(job->mode!=0)s->manuals--;s->active=1;SDL_UnlockMutex(s->mutex);
  int code=save(s,job);SaveResult result={0};result.ticket=job->ticket;result.state=job->state;result.generation=job->generation;result.context_generation=job->context_generation;result.mode=job->mode;result.code=code;result.error=mapped(code);result.recovery=s->draft_sequence!=0;result.revision=s->base_revision;
  if(code!=SQLITE_OK){snprintf(result.message,sizeof(result.message),"%s",code==CONFLICT_CODE?"O documento ou a recuperação foi alterado por outra sessão. Reabra antes de salvar.":s->worker_error);size_t n=strlen(result.message);while(n&&!tom_utf8_valid(result.message))result.message[--n]=0;}
  job_free(job);SDL_LockMutex(s->mutex);s->active=0;
  while(s->result_count==COMPLETIONS&&!s->stop)SDL_WaitCondition(s->condition,s->mutex);
  if(s->result_count<COMPLETIONS){s->results[(s->result_first+s->result_count)%COMPLETIONS]=result;s->result_count++;}
  SDL_BroadcastCondition(s->condition);SDL_UnlockMutex(s->mutex);
 }
 return 0;
}
static void dispose(TomDocumentStore *s){
 if(!s)return;
 if(s->thread){SDL_LockMutex(s->mutex);s->stop=1;SDL_BroadcastCondition(s->condition);SDL_UnlockMutex(s->mutex);SDL_WaitThread(s->thread,NULL);}
 SaveJob *job=s->first;while(job){SaveJob *next=job->next;job_free(job);job=next;}
 sqlite3_close_v2(s->db);SDL_DestroyCondition(s->condition);SDL_DestroyMutex(s->mutex);free(s->recovery_json);free(s->context);free(s->recovery_context);free(s);
}
void tom_document_store_free(TomDocumentStore *s){if(s){TomDocument *doc=s->document;dispose(s);tom_document_free(doc);tom_object_released();}}
static int schema(sqlite3 *db){
 int code=run(db,"BEGIN IMMEDIATE");if(code!=SQLITE_OK)return code;
 code=run(db,"CREATE TABLE IF NOT EXISTS tom_editor_meta(versao INTEGER NOT NULL); INSERT INTO tom_editor_meta SELECT 1 WHERE NOT EXISTS(SELECT 1 FROM tom_editor_meta)");
 sqlite3_stmt *q=NULL;int version=0;
 if(code==SQLITE_OK)code=prepare(db,"SELECT versao FROM tom_editor_meta",&q);
 if(code==SQLITE_OK){code=sqlite3_step(q);if(code==SQLITE_ROW){version=sqlite3_column_int(q,0);code=sqlite3_step(q)==SQLITE_DONE?SQLITE_OK:SQLITE_MISMATCH;}else code=SQLITE_MISMATCH;}
 code=finish(q,code);
 if(code==SQLITE_OK&&version!=1&&version!=2)code=SQLITE_MISMATCH;
 if(code==SQLITE_OK)code=run(db,"CREATE TABLE IF NOT EXISTS tom_editor_documentos(id INTEGER PRIMARY KEY,revisao INTEGER NOT NULL,texto TEXT NOT NULL,documento TEXT NOT NULL); CREATE TABLE IF NOT EXISTS tom_editor_recuperacoes(id INTEGER PRIMARY KEY REFERENCES tom_editor_documentos(id),revisao_base INTEGER NOT NULL,sequencia INTEGER NOT NULL,texto TEXT NOT NULL,documento TEXT NOT NULL); CREATE TABLE IF NOT EXISTS tom_editor_revisoes(id INTEGER PRIMARY KEY REFERENCES tom_editor_documentos(id),sequencia INTEGER NOT NULL); INSERT OR IGNORE INTO tom_editor_revisoes SELECT id,0 FROM tom_editor_documentos");
 if(code==SQLITE_OK&&version==1)code=run(db,"ALTER TABLE tom_editor_documentos ADD COLUMN contexto TEXT NOT NULL DEFAULT '{}'; ALTER TABLE tom_editor_recuperacoes ADD COLUMN contexto TEXT NOT NULL DEFAULT '{}'; UPDATE tom_editor_meta SET versao=2");
 if(code==SQLITE_OK)code=run(db,"COMMIT");if(code!=SQLITE_OK)run(db,"ROLLBACK");return code;
}
int32_t tom_document_store_schema(const char *path){
 if(!tom_utf8_valid(path)||!*path)return TOM_INVALID;sqlite3 *db=NULL;
 int code=sqlite3_open_v2(path,&db,SQLITE_OPEN_READWRITE|SQLITE_OPEN_CREATE,NULL);
 if(code==SQLITE_OK){sqlite3_busy_timeout(db,1000);code=schema(db);}sqlite3_close(db);return mapped(code);
}
static int startup(TomDocumentStore *s,const char *initial_text,const char *initial_json,int readonly,char **confirmed){
 int version=0;sqlite3_stmt *q=NULL;int code=prepare(s->db,"SELECT versao FROM tom_editor_meta",&q);if(code==SQLITE_OK){code=sqlite3_step(q);if(code==SQLITE_ROW){if(sqlite3_column_type(q,0)!=SQLITE_INTEGER||((version=sqlite3_column_int(q,0))!=1&&version!=2)||sqlite3_step(q)!=SQLITE_DONE)code=SQLITE_MISMATCH;else code=SQLITE_OK;}else code=SQLITE_MISMATCH;}code=finish(q,code);q=NULL;if(code!=SQLITE_OK)return code;
 if(!readonly){code=prepare(s->db,"INSERT OR IGNORE INTO tom_editor_documentos(id,revisao,texto,documento) VALUES(?1,1,?2,?3)",&q);if(code==SQLITE_OK)code=sqlite3_bind_int64(q,1,s->key);if(code==SQLITE_OK)code=sqlite3_bind_text(q,2,initial_text,-1,SQLITE_TRANSIENT);if(code==SQLITE_OK)code=sqlite3_bind_text(q,3,initial_json,-1,SQLITE_TRANSIENT);if(code==SQLITE_OK)code=sqlite3_step(q);code=finish(q,code);q=NULL;if(code!=SQLITE_OK)return code;}
 if(!readonly){code=prepare(s->db,"INSERT OR IGNORE INTO tom_editor_revisoes(id,sequencia) VALUES(?1,0)",&q);if(code==SQLITE_OK)code=sqlite3_bind_int64(q,1,s->key);if(code==SQLITE_OK)code=sqlite3_step(q);code=finish(q,code);q=NULL;if(code!=SQLITE_OK)return code;}
 code=prepare(s->db,version==2?
 "SELECT d.revisao,d.documento,r.sequencia,r.documento,r.revisao_base,v.sequencia,d.contexto,r.contexto FROM tom_editor_documentos d JOIN tom_editor_revisoes v ON v.id=d.id LEFT JOIN tom_editor_recuperacoes r ON r.id=d.id WHERE d.id=?1":
 "SELECT d.revisao,d.documento,r.sequencia,r.documento,r.revisao_base,v.sequencia,'{}','{}' FROM tom_editor_documentos d JOIN tom_editor_revisoes v ON v.id=d.id LEFT JOIN tom_editor_recuperacoes r ON r.id=d.id WHERE d.id=?1",&q);
 if(code==SQLITE_OK)code=sqlite3_bind_int64(q,1,s->key);
 if(code==SQLITE_OK){code=sqlite3_step(q);if(code==SQLITE_ROW){
  const char *context=(const char*)sqlite3_column_text(q,6);
  if(!valid_context(context))code=SQLITE_MISMATCH;else if(!(s->context=copy(context)))code=SQLITE_NOMEM;
  if(code==SQLITE_ROW&&sqlite3_column_type(q,2)!=SQLITE_NULL){const char *recovery=(const char*)sqlite3_column_text(q,7);if(!valid_context(recovery))code=SQLITE_MISMATCH;else if(!(s->recovery_context=copy(recovery)))code=SQLITE_NOMEM;}
  if(code!=SQLITE_ROW){sqlite3_finalize(q);return code;}
  if(sqlite3_column_type(q,0)!=SQLITE_INTEGER||sqlite3_column_int64(q,0)<1||sqlite3_column_type(q,1)!=SQLITE_TEXT)code=SQLITE_MISMATCH;
  else{const char *value=(const char*)sqlite3_column_text(q,1);if(!value)code=SQLITE_NOMEM;else if(strlen(value)!=(size_t)sqlite3_column_bytes(q,1))code=SQLITE_MISMATCH;else{*confirmed=copy(value);if(!*confirmed)code=SQLITE_NOMEM;}s->base_revision=sqlite3_column_int64(q,0);s->write_sequence=sqlite3_column_int64(q,5);if(s->write_sequence<0||sqlite3_column_type(q,5)!=SQLITE_INTEGER)code=SQLITE_MISMATCH;}
  if(code==SQLITE_ROW&&sqlite3_column_type(q,2)!=SQLITE_NULL){const char *value=(const char*)sqlite3_column_text(q,3);s->draft_sequence=sqlite3_column_int64(q,2);if(!value||s->draft_sequence<1||sqlite3_column_int64(q,4)!=s->base_revision||strlen(value)!=(size_t)sqlite3_column_bytes(q,3))code=SQLITE_MISMATCH;else{s->recovery_json=copy(value);if(!s->recovery_json)code=SQLITE_NOMEM;else s->await_recovery=s->has_recovery=1;}}
 }else if(code==SQLITE_DONE)code=SQLITE_NOTFOUND;}
 return finish(q,code);
}
static int32_t open_store(const char *path,int64_t key,TomDocument *doc,int readonly,TomDocumentStore **out){
 if(!doc||!out||!tom_utf8_valid(path)||!*path||key<1)return TOM_INVALID;
 TomDocumentStore *s=calloc(1,sizeof(*s));if(!s)return TOM_MEMORY;s->key=key;s->document=doc;
 int code=sqlite3_open_v2(path,&s->db,(readonly?SQLITE_OPEN_READONLY:SQLITE_OPEN_READWRITE|SQLITE_OPEN_CREATE)|SQLITE_OPEN_FULLMUTEX,NULL);
 if(code==SQLITE_OK){sqlite3_extended_result_codes(s->db,1);sqlite3_busy_timeout(s->db,1000);code=run(s->db,readonly?"PRAGMA foreign_keys=ON; PRAGMA synchronous=FULL":"PRAGMA foreign_keys=ON; PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL");}
 if(code==SQLITE_OK&&!readonly)code=schema(s->db);
 TomText *serialized=NULL;char *confirmed=NULL;int32_t error=mapped(code);
 if(!error)error=tom_text_dynamic_new("",INT32_MAX,&serialized);
 if(!error)error=tom_document_serialize(doc,serialized);
 if(!error)error=mapped(startup(s,doc->state.text->data,serialized->data,readonly,&confirmed));
 if(!error){s->mutex=SDL_CreateMutex();s->condition=SDL_CreateCondition();if(!s->mutex||!s->condition)error=TOM_MEMORY;}
 /* Validate recovery too, without replacing the confirmed content. */
 if(!error&&s->recovery_json){TomDocument *check=NULL;error=tom_document_new("",doc->state.text->limit,doc->history_limit,&check);if(!error)error=tom_document_load(check,s->recovery_json);tom_document_free(check);}
 if(!error){s->thread=SDL_CreateThread(worker,"tom-document-sqlite",s);if(!s->thread)error=TOM_RESOURCE;}
 if(!error)error=tom_document_load(doc,confirmed);
 free(confirmed);tom_text_free(serialized);
 if(error){dispose(s);return error;}
 s->observed_generation=s->scheduled_generation=doc->generation;s->last_result.revision=s->base_revision;
 tom_document_retain(doc);tom_object_acquired();tom_document_store_free(*out);*out=s;return TOM_OK;
}
int32_t tom_document_store_open(const char *path,int64_t key,TomDocument *doc,TomDocumentStore **out){return open_store(path,key,doc,0,out);}
int32_t tom_document_store_readonly(const char *path,int64_t key,TomDocument *doc,TomDocumentStore **out){return open_store(path,key,doc,1,out);}
int32_t tom_document_store_submit(TomDocumentStore *s,int32_t mode){
 if(!s||mode<0||mode>2)return TOM_INVALID;if(s->next_ticket>=INT64_MAX)return TOM_OVERFLOW;if(s->await_recovery&&mode!=2)return TOM_INVALID;
 SaveJob *job=calloc(1,sizeof(*job));if(!job)return TOM_MEMORY;job->mode=mode;job->state=s->document->state.id;job->generation=generation(s);job->context_generation=s->context_generation;job->ticket=s->next_ticket+1;
 if(mode!=2){TomText *json=NULL;int32_t error=tom_text_dynamic_new("",INT32_MAX,&json);if(!error)error=tom_document_serialize(s->document,json);if(!error){job->json=copy(json->data);job->text=copy(s->document->state.text->data);job->context=copy(s->context);if(!job->json||!job->text||!job->context)error=TOM_MEMORY;}tom_text_free(json);if(error){job_free(job);return error;}}
 SDL_LockMutex(s->mutex);
 if(mode!=0&&s->manuals>=MANUAL_QUEUE){SDL_UnlockMutex(s->mutex);job_free(job);return TOM_CAPACITY;}
 if(mode==0){
  SaveJob *previous=NULL,*p=s->first;while(p&&p->mode!=0){previous=p;p=p->next;}
  /* Move the replacement to the tail: never move a newer automatic snapshot
     ahead of an explicit request already queued by the user. */
  if(p){if(previous)previous->next=p->next;else s->first=p->next;if(s->last==p)s->last=previous;s->queued--;job_free(p);}
 }
 if(s->last)s->last->next=job;else s->first=job;s->last=job;s->queued++;if(mode!=0)s->manuals++;
 s->next_ticket=job->ticket;if(mode!=2)s->scheduled_generation=job->generation;
 SDL_SignalCondition(s->condition);SDL_UnlockMutex(s->mutex);if(mode==1)tom_document_break_group(s->document);return TOM_OK;
}
int32_t tom_document_store_poll(TomDocumentStore *s,int32_t *available){
 if(!s||!available)return TOM_INVALID;*available=0;SDL_LockMutex(s->mutex);
 if(s->result_count){s->last_result=s->results[s->result_first];s->result_first=(s->result_first+1)%COMPLETIONS;s->result_count--;*available=1;SDL_BroadcastCondition(s->condition);}
 SDL_UnlockMutex(s->mutex);if(!*available)return TOM_OK;
 SaveResult *r=&s->last_result;
 if(!r->error){s->has_recovery=r->recovery;if(r->mode==1){tom_document_mark_saved(s->document,(int64_t)r->state);s->saved_context_generation=r->context_generation;}if(r->mode==2){s->await_recovery=0;free(s->recovery_json);s->recovery_json=NULL;free(s->recovery_context);s->recovery_context=NULL;}s->retry_at=0;}
 else if(r->mode==0){s->scheduled_generation=0;s->retry_at=s->last_tick>INT64_MAX-5000000000?INT64_MAX:s->last_tick+5000000000;}
 return TOM_OK;
}
int32_t tom_document_store_check(TomDocumentStore *s){return s?s->last_result.error:TOM_INVALID;}
int32_t tom_document_store_message(TomDocumentStore *s,TomText *out){return s?tom_text_set(out,s->last_result.message):TOM_INVALID;}
int32_t tom_document_store_recover(TomDocumentStore *s){
 if(!s||!s->await_recovery||!s->recovery_json)return TOM_INVALID;
 int32_t error=tom_document_load(s->document,s->recovery_json);if(error)return error;free(s->context);s->context=s->recovery_context;s->recovery_context=NULL;s->context_generation++;tom_document_mark_saved(s->document,0);s->await_recovery=0;s->scheduled_generation=0;free(s->recovery_json);s->recovery_json=NULL;return TOM_OK;
}
int32_t tom_document_store_pause(TomDocumentStore *s,int32_t pause){if(!s||(pause!=0&&pause!=1))return TOM_INVALID;s->paused=pause;return TOM_OK;}
int32_t tom_document_store_tick(TomDocumentStore *s,int64_t now){
 if(!s||now<0)return TOM_INVALID;s->last_tick=now;
 if(now<s->observed_at){s->dirty_since=now;s->observed_at=now;}
 if(s->observed_generation!=generation(s)){s->observed_generation=generation(s);s->observed_at=now;if(!s->dirty_since)s->dirty_since=now;}
 if(s->paused||s->await_recovery||s->scheduled_generation==generation(s)||now<s->retry_at)return TOM_OK;
 if(now-s->observed_at>=2000000000||(s->dirty_since&&now-s->dirty_since>=15000000000)){
  int32_t error=tom_document_store_submit(s,0);if(!error)s->dirty_since=0;return error;
 }
 return TOM_OK;
}
int32_t tom_document_store_field(TomDocumentStore *s,int32_t field,int64_t *out){
 if(!s||!out)return TOM_INVALID;
 switch(field){
 case 0:SDL_LockMutex(s->mutex);*out=s->active||s->queued||s->result_count;SDL_UnlockMutex(s->mutex);break;
 case 1:*out=s->has_recovery;break;case 2:*out=s->last_result.mode;break;case 3:*out=s->last_result.error;break;case 4:*out=(int64_t)s->last_result.state;break;case 5:*out=(int64_t)s->last_result.ticket;break;case 6:*out=(int64_t)s->last_result.generation;break;case 7:*out=s->last_result.revision;break;case 8:*out=s->await_recovery;break;case 9:*out=(int64_t)s->next_ticket;break;case 10:*out=s->last_result.code;break;default:return TOM_BOUNDS;
 }return TOM_OK;
}

int32_t tom_document_store_context_set(TomDocumentStore *s,const char *context){
 if(!s||!valid_context(context))return TOM_INVALID;if(!strcmp(context,s->context))return TOM_OK;
 if(s->context_generation>=INT64_MAX-s->document->generation)return TOM_OVERFLOW;
 char *next=copy(context);if(!next)return TOM_MEMORY;free(s->context);s->context=next;s->context_generation++;return TOM_OK;
}
int32_t tom_document_store_context(TomDocumentStore *s,TomText *out){return s?tom_text_set(out,s->context):TOM_INVALID;}
int32_t tom_document_store_dirty(TomDocumentStore *s,int32_t *out){
 if(!s||!out)return TOM_INVALID;int32_t error=tom_document_dirty(s->document,out);if(!error&&s->context_generation!=s->saved_context_generation)*out=1;return error;
}
