#include "tom_runtime.h"
#include <sqlite3.h>
#include <utf8proc.h>
#include <stdlib.h>
#include <string.h>
#include <stdio.h>
#include <math.h>

struct TomSqlite {
  sqlite3 *handle;
  uint64_t references;
  int internal_transaction, error_code;
  char error_text[512];
  TomSqliteTransaction *transaction;
};
struct TomSqliteStatement { TomSqlite *db; sqlite3_stmt *handle; int state; };
struct TomSqliteTransaction { TomSqlite *db; int active; };
enum { QUERY_READY, QUERY_ROW, QUERY_DONE, QUERY_FAILED };

/* Literal word search, preserving case and accents, independent of FTS folding. */
static int word_character(int32_t c){int k=utf8proc_category(c);return (k>=UTF8PROC_CATEGORY_LU&&k<=UTF8PROC_CATEGORY_NO)||k==UTF8PROC_CATEGORY_PC||c==39||c==0x2019;}
static void exact_word(sqlite3_context *context,int argc,sqlite3_value **argv){
 (void)argc;const char *text=(const char*)sqlite3_value_text(argv[0]),*word=(const char*)sqlite3_value_text(argv[1]);
 if(!text||!word||!*word){sqlite3_result_int(context,0);return;}size_t n=strlen(word);int64_t count=0;const char *p=text;
 while((p=strstr(p,word))){const char *left=p;while(left>text&&((unsigned char)left[-1]&0xc0)==0x80)left--;if(left>text)left--;
  int32_t before=0,after=0;if(p>text)utf8proc_iterate((const unsigned char*)left,p-left,&before);if(p[n])utf8proc_iterate((const unsigned char*)p+n,-1,&after);
  if(!word_character(before)&&!word_character(after))count++;p+=n;
 }sqlite3_result_int64(context,count);
}
static int32_t status(TomSqlite *db, int code) {
  if (code==SQLITE_OK || code==SQLITE_ROW || code==SQLITE_DONE) return TOM_OK;
  if (db) {
    db->error_code=code;
    snprintf(db->error_text,sizeof(db->error_text),"%s",sqlite3_errmsg(db->handle));
    size_t n=strlen(db->error_text);
    while (n && !tom_utf8_valid(db->error_text)) db->error_text[--n]=0;
  }
  switch (code & 255) {
    case SQLITE_NOMEM: return TOM_MEMORY;
    case SQLITE_TOOBIG: return TOM_CAPACITY;
    case SQLITE_RANGE: return TOM_BOUNDS;
    case SQLITE_MISMATCH: return TOM_INVALID;
    case SQLITE_BUSY: case SQLITE_LOCKED: return TOM_SQLITE_BUSY;
    case SQLITE_READONLY: return TOM_SQLITE_READONLY;
    case SQLITE_CONSTRAINT: return TOM_SQLITE_CONSTRAINT;
    default: return TOM_SQLITE;
  }
}
static int authorize(void *context,int action,const char *a,const char *b,const char *c,const char *d) {
  (void)a;(void)b;(void)c;(void)d;
  TomSqlite *db=context;
  if ((action==SQLITE_TRANSACTION || action==SQLITE_SAVEPOINT) && !db->internal_transaction) return SQLITE_DENY;
  return SQLITE_OK;
}
static int32_t transaction_sql(TomSqlite *db,const char *sql) {
  db->internal_transaction=1;
  int code=sqlite3_exec(db->handle,sql,NULL,NULL,NULL);
  db->internal_transaction=0;
  return status(db,code);
}
static void retain(TomSqlite *db) { db->references++; }
void tom_sqlite_free(TomSqlite *db) {
  if (!db || --db->references) return;
  /* Children retain the connection until they have finalized their handles. */
  sqlite3_close_v2(db->handle); free(db); tom_object_released();
}
static int32_t open_database(const char *path,int readonly,TomSqlite **out) {
  if (!out || !tom_utf8_valid(path) || !*path) return TOM_INVALID;
  TomSqlite *db=calloc(1,sizeof(*db)); if (!db) return TOM_MEMORY;
  int flags=(readonly ? SQLITE_OPEN_READONLY : SQLITE_OPEN_READWRITE|SQLITE_OPEN_CREATE)|SQLITE_OPEN_FULLMUTEX;
  int code=sqlite3_open_v2(path,&db->handle,flags,NULL);
  int32_t error=status(db,code);
  if (!error) {
    sqlite3_create_function_v2(db->handle,"tom_palavra_exata",2,SQLITE_UTF8|SQLITE_DETERMINISTIC|SQLITE_INNOCUOUS,NULL,exact_word,NULL,NULL,NULL);
    sqlite3_extended_result_codes(db->handle,1);
    sqlite3_busy_timeout(db->handle,1000);
    sqlite3_set_authorizer(db->handle,authorize,db);
    error=status(db,sqlite3_exec(db->handle,readonly ? "PRAGMA foreign_keys=ON; PRAGMA synchronous=FULL;" :
      "PRAGMA foreign_keys=ON; PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL;",NULL,NULL,NULL));
  }
  if (error) { sqlite3_close_v2(db->handle); free(db); return error; }
  db->references=1;tom_object_acquired();tom_sqlite_free(*out);*out=db;return TOM_OK;
}
int32_t tom_sqlite_open(const char *path,TomSqlite **out) { return open_database(path,0,out); }
int32_t tom_sqlite_open_readonly(const char *path,TomSqlite **out) { return open_database(path,1,out); }
void tom_sqlite_statement_free(TomSqliteStatement *query) {
  if (query) { sqlite3_finalize(query->handle);tom_sqlite_free(query->db);free(query);tom_object_released(); }
}
static int empty_tail(const char *p) {
  while (*p) {
    if (*p==' ' || *p=='\t' || *p=='\r' || *p=='\n' || *p=='\f' || *p==';') { p++;continue; }
    if (p[0]=='-' && p[1]=='-') { p+=2;while(*p && *p!='\n')p++;continue; }
    if (p[0]=='/' && p[1]=='*') {
      const char *end=strstr(p+2,"*/");if(!end)return 1;p=end+2;continue;
    }
    return 0;
  }
  return 1;
}
int32_t tom_sqlite_prepare(TomSqlite *db,const char *sql,TomSqliteStatement **out) {
  if (!db || !out || !tom_utf8_valid(sql) || !*sql) return TOM_INVALID;
  if (strlen(sql)>INT32_MAX-1) return TOM_CAPACITY;
  sqlite3_stmt *statement=NULL;const char *tail=NULL;
  int32_t error=status(db,sqlite3_prepare_v3(db->handle,sql,-1,0,&statement,&tail));
  if (!error && !statement) error=TOM_INVALID;
  /* Do not prepare the tail: some PRAGMAs have preparation-time effects. */
  if (!error && tail && !empty_tail(tail)) error=TOM_INVALID;
  if (error) { sqlite3_finalize(statement);return error; }
  TomSqliteStatement *query=calloc(1,sizeof(*query));
  if (!query) { sqlite3_finalize(statement);return TOM_MEMORY; }
  query->db=db;query->handle=statement;retain(db);tom_object_acquired();
  tom_sqlite_statement_free(*out);*out=query;return TOM_OK;
}
static int32_t binding(TomSqliteStatement *query,int32_t index) {
  if (!query || query->state!=QUERY_READY) return TOM_INVALID;
  return index<1 || index>sqlite3_bind_parameter_count(query->handle) ? TOM_BOUNDS : TOM_OK;
}
int32_t tom_sqlite_bind_text(TomSqliteStatement *query,int32_t index,const char *value) {
  int32_t error=binding(query,index);if(error)return error;
  if (!tom_utf8_valid(value)) return TOM_INVALID;
  return status(query->db,sqlite3_bind_text64(query->handle,index,value,strlen(value),SQLITE_TRANSIENT,SQLITE_UTF8));
}
int32_t tom_sqlite_bind_i64(TomSqliteStatement *query,int32_t index,int64_t value) {
  int32_t error=binding(query,index);if(error)return error;
  return status(query->db,sqlite3_bind_int64(query->handle,index,value));
}
int32_t tom_sqlite_bind_f64(TomSqliteStatement *query,int32_t index,double value) {
  int32_t error=binding(query,index);if(error)return error;
  if (!isfinite(value)) return TOM_INVALID;
  return status(query->db,sqlite3_bind_double(query->handle,index,value));
}
int32_t tom_sqlite_bind_bool(TomSqliteStatement *query,int32_t index,int32_t value) {
  if (value!=0 && value!=1) return TOM_INVALID;
  return tom_sqlite_bind_i64(query,index,value);
}
int32_t tom_sqlite_bind_null(TomSqliteStatement *query,int32_t index) {
  int32_t error=binding(query,index);if(error)return error;
  return status(query->db,sqlite3_bind_null(query->handle,index));
}
int32_t tom_sqlite_step(TomSqliteStatement *query,int32_t *row) {
  if (!query || !row || query->state==QUERY_FAILED) return TOM_INVALID;
  if (query->state==QUERY_DONE) { *row=0;return TOM_OK; }
  int code=sqlite3_step(query->handle);
  query->state=code==SQLITE_ROW ? QUERY_ROW : code==SQLITE_DONE ? QUERY_DONE : QUERY_FAILED;
  int32_t error=status(query->db,code);if(error)return error;
  *row=code==SQLITE_ROW;return TOM_OK;
}
int32_t tom_sqlite_reset(TomSqliteStatement *query) {
  if (!query) return TOM_INVALID;
  /* reset reports the preceding step's error; that error was already returned. */
  sqlite3_reset(query->handle);query->state=QUERY_READY;
  return status(query->db,sqlite3_clear_bindings(query->handle));
}
int32_t tom_sqlite_column_count(TomSqliteStatement *query,int32_t *out) {
  if (!query || !out) return TOM_INVALID;
  *out=sqlite3_column_count(query->handle);return TOM_OK;
}
static int32_t column(TomSqliteStatement *query,int32_t index,int type) {
  if (!query || query->state!=QUERY_ROW) return TOM_INVALID;
  if (index<0 || index>=sqlite3_column_count(query->handle)) return TOM_BOUNDS;
  return type && sqlite3_column_type(query->handle,index)!=type ? TOM_INVALID : TOM_OK;
}
int32_t tom_sqlite_column_type(TomSqliteStatement *query,int32_t index,int32_t *out) {
  if (!out) return TOM_INVALID;
  int32_t error=column(query,index,0);if(error)return error;
  *out=sqlite3_column_type(query->handle,index);return TOM_OK;
}
int32_t tom_sqlite_column_text(TomSqliteStatement *query,int32_t index,TomText *out) {
  if (!out) return TOM_INVALID;
  int32_t error=column(query,index,SQLITE_TEXT);if(error)return error;
  const char *value=(const char *)sqlite3_column_text(query->handle,index);
  if (!value) return status(query->db,SQLITE_NOMEM);
  int size=sqlite3_column_bytes(query->handle,index);
  if (memchr(value,0,(size_t)size)) return TOM_INVALID;
  return tom_text_set(out,value);
}
int32_t tom_sqlite_column_i64(TomSqliteStatement *query,int32_t index,int64_t *out) {
  if (!out) return TOM_INVALID;
  int32_t error=column(query,index,SQLITE_INTEGER);if(error)return error;
  *out=sqlite3_column_int64(query->handle,index);return TOM_OK;
}
int32_t tom_sqlite_column_f64(TomSqliteStatement *query,int32_t index,double *out) {
  if (!out) return TOM_INVALID;
  int32_t error=column(query,index,SQLITE_FLOAT);if(error)return error;
  double value=sqlite3_column_double(query->handle,index);
  if (!isfinite(value)) return TOM_INVALID;
  *out=value;return TOM_OK;
}
int32_t tom_sqlite_column_bool(TomSqliteStatement *query,int32_t index,int32_t *out) {
  if (!out) return TOM_INVALID;
  int64_t value;int32_t error=tom_sqlite_column_i64(query,index,&value);if(error)return error;
  if (value!=0 && value!=1) return TOM_INVALID;
  *out=(int32_t)value;return TOM_OK;
}
int32_t tom_sqlite_begin(TomSqlite *db,TomSqliteTransaction **out) {
  if (!db || !out || db->transaction || !sqlite3_get_autocommit(db->handle)) return TOM_INVALID;
  TomSqliteTransaction *tx=calloc(1,sizeof(*tx));if(!tx)return TOM_MEMORY;
  int32_t error=transaction_sql(db,"BEGIN IMMEDIATE");if(error){free(tx);return error;}
  tx->db=db;tx->active=1;db->transaction=tx;retain(db);tom_object_acquired();
  tom_sqlite_transaction_free(*out);*out=tx;return TOM_OK;
}
static int32_t finish_transaction(TomSqliteTransaction *tx,int commit) {
  if (!tx || !tx->active || tx->db->transaction!=tx) return TOM_INVALID;
  /* SQLite may have rolled back itself after SQLITE_FULL/IOERR/NOMEM. */
  if (sqlite3_get_autocommit(tx->db->handle)) {
    tx->active=0;tx->db->transaction=NULL;return commit ? TOM_SQLITE : TOM_OK;
  }
  int32_t error=transaction_sql(tx->db,commit ? "COMMIT" : "ROLLBACK");
  if (!error) { tx->active=0;tx->db->transaction=NULL; }
  return error;
}
int32_t tom_sqlite_commit(TomSqliteTransaction *tx) { return finish_transaction(tx,1); }
int32_t tom_sqlite_rollback(TomSqliteTransaction *tx) { return finish_transaction(tx,0); }
void tom_sqlite_transaction_free(TomSqliteTransaction *tx) {
  if (!tx) return;
  if (tx->active) {
    finish_transaction(tx,0);
    /* Never leave the connection pointing to a freed lexical guard. */
    tx->db->transaction=NULL;
  }
  tom_sqlite_free(tx->db);free(tx);tom_object_released();
}
int32_t tom_sqlite_backup(TomSqlite *source,TomSqlite *destination) {
  if (!source || !destination || source==destination || source->transaction || destination->transaction) return TOM_INVALID;
  /* Reject aliases of the same on-disk database, including another connection. */
  const char *a=sqlite3_db_filename(source->handle,"main"),*b=sqlite3_db_filename(destination->handle,"main");
  if (a && b && *a && !strcmp(a,b)) return TOM_INVALID;
  sqlite3_backup *backup=sqlite3_backup_init(destination->handle,"main",source->handle,"main");
  if (!backup) return status(destination,sqlite3_errcode(destination->handle));
  int code=SQLITE_OK,waited=0;
  do {
    code=sqlite3_backup_step(backup,128);
    if (code==SQLITE_BUSY || code==SQLITE_LOCKED) { sqlite3_sleep(10);waited+=10; }
  } while (code==SQLITE_OK || ((code==SQLITE_BUSY || code==SQLITE_LOCKED) && waited<1000));
  int32_t error=code==SQLITE_DONE ? TOM_OK : status(destination,code);
  int finish=sqlite3_backup_finish(backup);
  return error ? error : status(destination,finish);
}
int32_t tom_sqlite_error_code(TomSqlite *db,int32_t *out) {
  if (!db || !out) return TOM_INVALID;
  *out=db->error_code;return TOM_OK;
}
int32_t tom_sqlite_error_text(TomSqlite *db,TomText *out) {
  return db ? tom_text_set(out,db->error_text) : TOM_INVALID;
}
