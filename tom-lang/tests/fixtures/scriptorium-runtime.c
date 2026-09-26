#include "tom_runtime.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#define CHECK(x) do { if (!(x)) { fprintf(stderr,"scriptorium assertion at %d: %s\n",__LINE__,#x);return 1; } } while(0)
extern void tom_text_test_fail_after(int64_t count);
static int32_t execute_sql(TomSqlite *db,const char *sql) {
  TomSqliteStatement *q=NULL;int32_t row=0,error=tom_sqlite_prepare(db,sql,&q);
  if (!error) error=tom_sqlite_step(q,&row);
  tom_sqlite_statement_free(q);return error;
}
int main(int argc,char **argv) {
  CHECK(argc==3);
  if (!strcmp(argv[1],"crash")) {
    TomSqlite *db=NULL;TomSqliteTransaction *tx=NULL;
    CHECK(tom_sqlite_open(argv[2],&db)==0);
    CHECK(execute_sql(db,"CREATE TABLE textos(id INTEGER PRIMARY KEY, texto TEXT)")==0);
    CHECK(execute_sql(db,"INSERT INTO textos VALUES(1,'original')")==0);
    CHECK(execute_sql(db,"PRAGMA cache_size=1")==0);
    CHECK(tom_sqlite_begin(db,&tx)==0);
    CHECK(execute_sql(db,"UPDATE textos SET texto='uncommitted'")==0);
    CHECK(execute_sql(db,"WITH RECURSIVE n(i) AS (VALUES(2) UNION ALL SELECT i+1 FROM n WHERE i<2000) INSERT INTO textos SELECT i, printf('%01000d',i) FROM n")==0);
    /* Bypass every destructor: simulate termination with a pending write. */
    _Exit(42);
  }
  if (!strcmp(argv[1],"recover")) {
    TomSqlite *db=NULL;TomSqliteStatement *q=NULL;TomText *text=NULL;int32_t row=0;
    CHECK(tom_sqlite_open(argv[2],&db)==0);
    CHECK(tom_sqlite_prepare(db,"SELECT texto FROM textos",&q)==0);
    CHECK(tom_sqlite_step(q,&row)==0 && row);
    CHECK(tom_text_dynamic_new("",1024,&text)==0);
    CHECK(tom_sqlite_column_text(q,0,text)==0 && !strcmp(text->data,"original"));
    tom_sqlite_statement_free(q);q=NULL;
    CHECK(tom_sqlite_prepare(db,"PRAGMA integrity_check",&q)==0);
    CHECK(tom_sqlite_step(q,&row)==0 && row);
    CHECK(tom_sqlite_column_text(q,0,text)==0 && !strcmp(text->data,"ok"));
    tom_sqlite_statement_free(q);tom_text_free(text);tom_sqlite_free(db);
    CHECK(tom_live_objects()==0);puts("recovered");return 0;
  }
  TomText *text=NULL,*fixed=NULL;char large[1024];memset(large,'x',sizeof(large)-1);large[sizeof(large)-1]=0;
  CHECK(tom_text_dynamic_new("0123456789012345678901234567890123456789",4096,&text)==0);
  TomTextView view={NULL,text};
  for (int fault=0;fault<2;fault++) {
    tom_text_test_fail_after(fault);
    CHECK(tom_text_append(text,text->data)==TOM_MEMORY);
    CHECK(text->length==40 && text->capacity==64);
    CHECK(!strcmp(text->data,"0123456789012345678901234567890123456789"));
  }
  tom_text_test_fail_after(0);
  CHECK(tom_text_append(text,large)==TOM_MEMORY && text->length==40);
  CHECK(tom_text_append(text,large)==0);
  CHECK(tom_text_view_data(&view)==text->data && strlen(tom_text_view_data(&view))==1063);
  CHECK(tom_text_set(text,"á🐈é")==0);
  CHECK(tom_text_insert(text,1,text->data)==0 && !strcmp(text->data,"áá🐈é🐈é"));
  CHECK(tom_text_substitute(text,0,4,text->data+2)==0);
  char *before=malloc((size_t)text->length+1);CHECK(before);strcpy(before,text->data);
  CHECK(tom_text_append(text,"\xc0\xaf")==TOM_INVALID && !strcmp(text->data,before));
  CHECK(tom_text_remove(text,UINT64_MAX,1)==TOM_BOUNDS && !strcmp(text->data,before));
  tom_text_test_fail_after(0);
  CHECK(tom_text_slice(text,text->data,1,1)==TOM_MEMORY && !strcmp(text->data,before));
  free(before);
  CHECK(tom_text_new(5,"old",&fixed)==0);
  CHECK(tom_text_set(fixed,"oversized")==TOM_CAPACITY && !strcmp(fixed->data,"old"));
  CHECK(tom_text_dynamic_new("",1,&fixed)==0);
  CHECK(tom_text_append(fixed,"x")==TOM_CAPACITY && !fixed->length);
  int64_t position=42;
  CHECK(tom_text_find("á🐈é","é",0,&position)==0 && position==2);
  CHECK(tom_text_find("abc","",3,&position)==0 && position==3);
  CHECK(tom_text_find("abc","",4,&position)==TOM_BOUNDS && position==3);
  tom_text_free(fixed);tom_text_free(text);
  CHECK(tom_live_objects()==0);puts("runtime-ok");return 0;
}
