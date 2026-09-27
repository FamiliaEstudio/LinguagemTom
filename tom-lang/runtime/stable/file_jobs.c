#include "docx.h"
#include "file_io.h"
#include "xlsx.h"
#define SDL_MAIN_HANDLED
#include <SDL3/SDL.h>
#include <sqlite3.h>
#include <yyjson.h>
#include <stdatomic.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>
struct TomFileJob{SDL_Thread *thread;char *request,*result;_Atomic int state,cancel,progress,error;char message[512];};
static const char *str(yyjson_val *v,const char *key){const char *s=yyjson_get_str(yyjson_obj_get(v,key));return s?s:"";}
static int32_t cancelled(TomFileJob *j){return atomic_load(&j->cancel)?TOM_LATE:TOM_OK;}
static int32_t set_result(TomFileJob *j,yyjson_mut_doc *doc){j->result=yyjson_mut_write(doc,0,NULL);return j->result?TOM_OK:TOM_MEMORY;}
static int32_t hash_string(const char *path,char hex[65]){TomText value={65,0,hex,0};hex[0]=0;return tom_file_hash(path,&value);}
static int32_t make_parent(const char *path){char *p=SDL_strdup(path);if(!p)return TOM_MEMORY;char *last=strrchr(p,'/');int32_t e=0;if(last){*last=0;e=tom_file_mkdir(p);}SDL_free(p);return e;}
static int32_t integrity(const char *path){sqlite3 *db=NULL;sqlite3_stmt *q=NULL;int code=sqlite3_open_v2(path,&db,SQLITE_OPEN_READONLY,NULL);if(code==SQLITE_OK)code=sqlite3_prepare_v2(db,"PRAGMA integrity_check",-1,&q,NULL);if(code==SQLITE_OK){code=sqlite3_step(q);if(code==SQLITE_ROW&&strcmp((const char*)sqlite3_column_text(q,0),"ok")==0&&sqlite3_step(q)==SQLITE_DONE)code=SQLITE_OK;else code=SQLITE_CORRUPT;}sqlite3_finalize(q);sqlite3_close(db);return code==SQLITE_OK?TOM_OK:TOM_SQLITE;}
static SDL_EnumerationResult remove_entry(void *unused,const char *dir,const char *name){(void)unused;char *p=tom_file_join(dir,name);if(!p)return SDL_ENUM_FAILURE;SDL_PathInfo info;if(SDL_GetPathInfo(p,&info)&&info.type==SDL_PATHTYPE_DIRECTORY)SDL_EnumerateDirectory(p,remove_entry,NULL);int ok=SDL_RemovePath(p);free(p);return ok?SDL_ENUM_CONTINUE:SDL_ENUM_FAILURE;}
static void remove_tree(const char *path){SDL_EnumerateDirectory(path,remove_entry,NULL);SDL_RemovePath(path);}
static int32_t spreadsheet_progress(void *context,int percent){
 TomFileJob *j=context;int current=atomic_load(&j->progress);if(percent>current)atomic_store(&j->progress,percent);return cancelled(j);
}
static int32_t read_spreadsheet(TomFileJob *j,yyjson_val *request){
 const char *source=str(request,"origem"),*sheet=str(request,"aba"),*cache=str(request,"fontes");
 const char *extension=strrchr(source,'.');
 if(!*source||!*sheet||!extension||SDL_strcasecmp(extension,".xlsx")){
  snprintf(j->message,sizeof(j->message),"Escolha um arquivo .xlsx e informe a aba.");return TOM_INVALID;
 }
 int32_t e=cancelled(j);char hash[65],verify[65];char *cached=NULL;
 if(!e)e=hash_string(source,hash);
 if(!e&&*cache){
  e=tom_file_mkdir(cache);if(!e){cached=tom_file_join(cache,hash);if(!cached)e=TOM_MEMORY;}
  int32_t exists=0;if(!e)e=tom_file_exists(cached,&exists);if(!e&&!exists)e=tom_file_copy(source,cached);
  if(!e)e=hash_string(cached,verify);if(!e&&strcmp(hash,verify))e=TOM_CONFLICT;
 }
 yyjson_mut_doc *result=yyjson_mut_doc_new(NULL);if(!result&&!e)e=TOM_MEMORY;
 if(!e)e=tom_xlsx_read(cached?cached:source,sheet,result,spreadsheet_progress,j,j->message,sizeof(j->message));
 /* A caller without a source cache still receives a hash of the bytes read. */
 if(!e)e=hash_string(cached?cached:source,verify);if(!e&&strcmp(hash,verify))e=TOM_CONFLICT;
 if(!e)e=cancelled(j);
 if(!e){yyjson_mut_val *root=yyjson_mut_doc_get_root(result);
  if(!yyjson_mut_obj_add_strcpy(result,root,"hash",hash)||!yyjson_mut_obj_add_strcpy(result,root,"origem",source))e=TOM_MEMORY;
  else e=set_result(j,result);
 }
 if(!e&&strlen(j->result)>=268435456){free(j->result);j->result=NULL;e=TOM_CAPACITY;}
 yyjson_mut_doc_free(result);free(cached);return e;
}
static int32_t import_document(TomFileJob *j,yyjson_val *request){
 const char *source=str(request,"origem"),*cache=str(request,"fontes");if(!*source)return TOM_INVALID;char hash[65];int32_t e=hash_string(source,hash);if(e)return e;atomic_store(&j->progress,10);
 char *cached=NULL;if(*cache){e=tom_file_mkdir(cache);cached=tom_file_join(cache,hash);if(!cached)e=TOM_MEMORY;int32_t exists=0;if(!e)e=tom_file_exists(cached,&exists);if(!e&&!exists)e=tom_file_copy(source,cached);char verify[65];if(!e)e=hash_string(cached,verify);if(!e&&strcmp(hash,verify))e=TOM_CONFLICT;}
 TomDocument *doc=NULL;TomText *warnings=NULL,*serialized=NULL;const char *read=cached?cached:source;
 if(!e)e=cancelled(j);if(!e)e=tom_document_new("",67108864,134217728,&doc);if(!e)e=tom_text_dynamic_new("",1048576,&warnings);if(!e)e=tom_text_dynamic_new("",268435456,&serialized);
 const char *extension=strrchr(source,'.');
 if(!e&&extension&&SDL_strcasecmp(extension,".docx")==0)e=tom_docx_read(read,doc,warnings);
 else if(!e){e=tom_file_read_text(read,serialized);if(!e){const char *text=serialized->data;if(!memcmp(text,"\xef\xbb\xbf",strlen(text)>=3?3:0)&&strlen(text)>=3)text+=3;e=tom_document_insert(doc,text);}}
 atomic_store(&j->progress,80);if(!e)e=cancelled(j);if(!e)e=tom_document_serialize(doc,serialized);
 yyjson_mut_doc *result=yyjson_mut_doc_new(NULL);yyjson_doc *content=NULL;if(!result&&!e)e=TOM_MEMORY;
 if(!e){content=yyjson_read(serialized->data,strlen(serialized->data),0);yyjson_mut_val *root=yyjson_mut_obj(result);yyjson_mut_doc_set_root(result,root);
  if(!content||!root||!yyjson_mut_obj_add_strcpy(result,root,"hash",hash)||!yyjson_mut_obj_add_strcpy(result,root,"origem",source)||!yyjson_mut_obj_add_strcpy(result,root,"avisos",warnings->data)||!yyjson_mut_obj_add_val(result,root,"documento",yyjson_val_mut_copy(result,yyjson_doc_get_root(content))))e=TOM_MEMORY;else e=set_result(j,result);}
 yyjson_doc_free(content);yyjson_mut_doc_free(result);tom_document_free(doc);tom_text_free(warnings);tom_text_free(serialized);free(cached);return e;
}
static int32_t merge(TomDocument *out,TomDocument *part,int separator){
 TomText *text=NULL,*json=NULL;TomDocument *joined=NULL;int32_t e=tom_text_dynamic_new(out->state.text->data,67108864,&text);if(!e&&separator)e=tom_text_append(text,"\n\n");uint32_t offset=out->state.count+(separator?2:0);if(!e)e=tom_text_append(text,part->state.text->data);if(!e)e=tom_document_new(text->data,67108864,134217728,&joined);
 if(!e){size_t cap=out->state.run_count+part->state.run_count+1,n=0;TomDocRun *runs=malloc(cap*sizeof(*runs));if(!runs)e=TOM_MEMORY;else{
  for(size_t i=0;i<out->state.run_count;i++)if(out->state.runs[i].pos)runs[n++]=out->state.runs[i];if(separator)runs[n++]=(TomDocRun){offset,12u<<8};
  for(size_t i=0;i<part->state.run_count;i++)if(part->state.runs[i].pos)runs[n++]=(TomDocRun){part->state.runs[i].pos+offset,part->state.runs[i].value};if(!n)runs[n++]=(TomDocRun){0,12u<<8};free(joined->state.runs);joined->state.runs=runs;size_t normalized=0;for(size_t i=0;i<n;i++){if(normalized&&runs[normalized-1].value==runs[i].value)runs[normalized-1].pos=runs[i].pos;else runs[normalized++]=runs[i];}joined->state.run_count=normalized;
  for(size_t i=0;i<joined->state.paragraph_count;i++){uint32_t p=joined->state.paragraphs[i].pos;joined->state.paragraphs[i].value=p<out->state.count?tom_document_alignment_at(out,p):p>=offset?tom_document_alignment_at(part,p-offset):0;}
 }}
 if(!e)e=tom_text_dynamic_new("",268435456,&json);if(!e)e=tom_document_serialize(joined,json);if(!e)e=tom_document_load(out,json->data);tom_text_free(text);tom_text_free(json);tom_document_free(joined);return e;
}
static int32_t export_document(TomFileJob *j,yyjson_val *request){
 const char *destination=str(request,"destino");yyjson_val *documents=yyjson_obj_get(request,"documentos");
 if(!*destination)return TOM_INVALID;
 sqlite3 *database=NULL;sqlite3_stmt *query=NULL;int32_t e=0;size_t count=0;
 if(!yyjson_is_arr(documents)){
  int code=sqlite3_open_v2(str(request,"banco"),&database,SQLITE_OPEN_READONLY,NULL);
  if(code==SQLITE_OK)code=sqlite3_prepare_v2(database,str(request,"consulta"),-1,&query,NULL);
  if(code==SQLITE_OK&&(!query||!sqlite3_stmt_readonly(query)||sqlite3_column_count(query)!=1))code=SQLITE_MISUSE;
  if(code==SQLITE_OK)code=sqlite3_bind_text(query,1,str(request,"parametro"),-1,SQLITE_TRANSIENT);
  if(code!=SQLITE_OK)e=TOM_SQLITE;
 }
 TomDocument *combined=NULL,*part=NULL;if(!e)e=tom_document_new("",67108864,134217728,&combined);if(!e)e=tom_document_new("",67108864,134217728,&part);
 if(!e&&query){int step;while((step=sqlite3_step(query))==SQLITE_ROW){e=cancelled(j);const char *json=(const char*)sqlite3_column_text(query,0);if(!e)e=tom_document_load(part,json);if(!e)e=merge(combined,part,count!=0);if(e)break;count++;atomic_store(&j->progress,(int)(count*80/(count+1)));}if(!e&&step!=SQLITE_DONE)e=TOM_SQLITE;}
 else if(!e){size_t i,n;yyjson_val *value;yyjson_arr_foreach(documents,i,n,value){if(e)break;e=cancelled(j);char *json=yyjson_val_write(value,0,NULL);if(!json)e=TOM_MEMORY;if(!e)e=tom_document_load(part,json);if(!e)e=merge(combined,part,i!=0);free(json);count++;atomic_store(&j->progress,(int)((i+1)*80/n));}}
 sqlite3_finalize(query);sqlite3_close(database);if(!e&&!count)e=TOM_INVALID;
 if(!e)e=cancelled(j);if(!e)e=strcmp(str(request,"formato"),"txt")==0||strcmp(str(request,"formato"),"md")==0?tom_file_write_all(destination,combined->state.text->data,strlen(combined->state.text->data)):tom_docx_write(destination,combined);
 if(!e){yyjson_mut_doc *r=yyjson_mut_doc_new(NULL);yyjson_mut_val *root=r?yyjson_mut_obj(r):NULL;if(!root)e=TOM_MEMORY;else{yyjson_mut_doc_set_root(r,root);yyjson_mut_obj_add_strcpy(r,root,"destino",destination);e=set_result(j,r);}yyjson_mut_doc_free(r);}tom_document_free(combined);tom_document_free(part);return e;
}

typedef struct{char *path;int64_t time;int manual;} Snapshot;
typedef struct{Snapshot *items;size_t count,cap;} Snapshots;
static SDL_EnumerationResult collect_snapshots(void *data,const char *dir,const char *name){
 Snapshots *s=data;if(strncmp(name,"snapshot-",9)||strstr(name,".partial"))return SDL_ENUM_CONTINUE;char *p=tom_file_join(dir,name),*f=p?tom_file_join(p,"manifesto.json"):NULL;unsigned char *bytes=NULL;size_t size=0;
 if(f&&!tom_file_read_all(f,16777216,&bytes,&size)){yyjson_doc *doc=yyjson_read((char*)bytes,size,0);yyjson_val *root=doc?yyjson_doc_get_root(doc):NULL;
  if(root&&!strcmp(str(root,"formato"),"TomSnapshot")&&!strcmp(str(root,"classe"),"diario")){if(s->count==s->cap){size_t cap=s->cap?s->cap*2:16;Snapshot *next=realloc(s->items,cap*sizeof(*next));if(next){s->items=next;s->cap=cap;}}if(s->count<s->cap){s->items[s->count++]=(Snapshot){p,yyjson_get_sint(yyjson_obj_get(root,"epoch")),0};p=NULL;}}yyjson_doc_free(doc);}
 free(bytes);free(f);free(p);return SDL_ENUM_CONTINUE;
}
static int newest(const void *a,const void *b){int64_t x=((const Snapshot*)a)->time,y=((const Snapshot*)b)->time;return x>y?-1:x<y?1:0;}
static void retention(const char *directory){
 Snapshots s={0};SDL_EnumerateDirectory(directory,collect_snapshots,&s);qsort(s.items,s.count,sizeof(*s.items),newest);int64_t days[7],weeks[4];size_t nd=0,nw=0;
 for(size_t i=0;i<s.count;i++){int keep=0;int64_t day=s.items[i].time/86400,week=day/7;size_t d=0,w=0;while(d<nd&&days[d]!=day)d++;while(w<nw&&weeks[w]!=week)w++;
  if(d==nd&&nd<7){days[nd++]=day;keep=1;}if(w==nw&&nw<4){weeks[nw++]=week;keep=1;}if(!keep)remove_tree(s.items[i].path);free(s.items[i].path);}free(s.items);
}
static int32_t snapshot(TomFileJob *j,yyjson_val *request){
 const char *database=str(request,"banco"),*root=str(request,"raiz"),*destination=str(request,"destino"),*query=str(request,"consulta"),*kind=str(request,"classe");
 if(!*database||!*root||!*destination||!*query)return TOM_INVALID;
 int64_t epoch=(int64_t)time(NULL);char name[128];snprintf(name,sizeof(name),"snapshot-%lld-%llu",(long long)epoch,(unsigned long long)SDL_GetTicksNS());char *final=tom_file_join(destination,name);strcat(name,".partial");char *staging=tom_file_join(destination,name);char *dbpath=staging?tom_file_join(staging,"dados.sqlite"):NULL;
 int32_t e=final&&staging&&dbpath?tom_file_mkdir(staging):TOM_MEMORY;sqlite3 *source=NULL,*target=NULL;sqlite3_stmt *files=NULL;int code=SQLITE_OK;
 yyjson_mut_doc *manifest=yyjson_mut_doc_new(NULL);yyjson_mut_val *m=manifest?yyjson_mut_obj(manifest):NULL,*array=manifest?yyjson_mut_arr(manifest):NULL;if(!m||!array)e=TOM_MEMORY;
 if(!e){yyjson_mut_doc_set_root(manifest,m);yyjson_mut_obj_add_str(manifest,m,"formato","TomSnapshot");yyjson_mut_obj_add_int(manifest,m,"versao",1);yyjson_mut_obj_add_int(manifest,m,"epoch",epoch);yyjson_mut_obj_add_strcpy(manifest,m,"classe",*kind?kind:"manual");yyjson_mut_obj_add_val(manifest,m,"arquivos",array);
  code=sqlite3_open_v2(database,&source,SQLITE_OPEN_READONLY|SQLITE_OPEN_FULLMUTEX,NULL);if(code==SQLITE_OK){sqlite3_busy_timeout(source,1000);code=sqlite3_exec(source,"BEGIN",NULL,NULL,NULL);}if(code==SQLITE_OK)code=sqlite3_prepare_v2(source,query,-1,&files,NULL);if(code==SQLITE_OK&&(!sqlite3_stmt_readonly(files)||(sqlite3_column_count(files)<1||sqlite3_column_count(files)>2)))code=SQLITE_MISUSE;
  /* Establish the same read transaction for the file list and the database copy. */
  if(code==SQLITE_OK){int step;while((step=sqlite3_step(files))==SQLITE_ROW){const char *relative=(const char*)sqlite3_column_text(files,0);if(!relative||!tom_file_relative(relative)){code=SQLITE_MISUSE;break;}
    char *from=tom_file_join(root,relative),*to=tom_file_join(staging,relative);char hash[65];if(!from||!to)e=TOM_MEMORY;if(!e)e=cancelled(j);if(!e)e=make_parent(to);if(!e)e=tom_file_copy(from,to);if(!e)e=hash_string(to,hash);if(!e&&sqlite3_column_count(files)==2){const char *expected=(const char*)sqlite3_column_text(files,1);if(!expected||strcmp(hash,expected))e=TOM_CONFLICT;}
    if(!e){yyjson_mut_val *item=yyjson_mut_obj(manifest);yyjson_mut_obj_add_strcpy(manifest,item,"caminho",relative);yyjson_mut_obj_add_strcpy(manifest,item,"hash",hash);yyjson_mut_arr_add_val(array,item);}free(from);free(to);if(e)break;
   }if(!e&&code==SQLITE_OK&&step!=SQLITE_DONE)code=step;}
  if(!e&&code==SQLITE_OK)code=sqlite3_open_v2(dbpath,&target,SQLITE_OPEN_READWRITE|SQLITE_OPEN_CREATE,NULL);
  if(!e&&code==SQLITE_OK){sqlite3_backup *b=sqlite3_backup_init(target,"main",source,"main");if(!b)code=sqlite3_errcode(target);else{do{if((e=cancelled(j)))break;code=sqlite3_backup_step(b,128);int total=sqlite3_backup_pagecount(b),remaining=sqlite3_backup_remaining(b);if(total)atomic_store(&j->progress,20+(total-remaining)*60/total);}while(code==SQLITE_OK);int done=sqlite3_backup_finish(b);if(code==SQLITE_DONE)code=done;}}
  if(code!=SQLITE_OK&&!e){e=TOM_SQLITE;snprintf(j->message,sizeof(j->message),"Backup SQLite: %s",source?sqlite3_errmsg(source):"falha ao abrir");}
 }
 sqlite3_finalize(files);if(source)sqlite3_exec(source,"ROLLBACK",NULL,NULL,NULL);sqlite3_close(source);sqlite3_close(target);
 char hash[65];if(!e)e=integrity(dbpath);if(!e)e=hash_string(dbpath,hash);if(!e){yyjson_mut_obj_add_strcpy(manifest,m,"banco_hash",hash);char *data=yyjson_mut_write(manifest,YYJSON_WRITE_PRETTY,NULL),*path=tom_file_join(staging,"manifesto.json");if(!data||!path)e=TOM_MEMORY;else e=tom_file_write_text(path,data);free(data);free(path);}
 if(!e)e=cancelled(j);if(!e)e=tom_file_publish(staging,final,0);
 if(!e){yyjson_mut_doc *r=yyjson_mut_doc_new(NULL);yyjson_mut_val *v=r?yyjson_mut_obj(r):NULL;if(!v)e=TOM_MEMORY;else{yyjson_mut_doc_set_root(r,v);yyjson_mut_obj_add_strcpy(r,v,"destino",final);e=set_result(j,r);}yyjson_mut_doc_free(r);if(!strcmp(kind,"diario"))retention(destination);}
 if(e&&staging)remove_tree(staging);yyjson_mut_doc_free(manifest);free(final);free(staging);free(dbpath);return e;
}
static int32_t restore(TomFileJob *j,yyjson_val *request){
 const char *source=str(request,"origem"),*parent=str(request,"destino");if(!*source||!*parent)return TOM_INVALID;
 char *manifest_path=tom_file_join(source,"manifesto.json"),*db=tom_file_join(source,"dados.sqlite");unsigned char *bytes=NULL;size_t size=0;int32_t e=manifest_path&&db?tom_file_read_all(manifest_path,16777216,&bytes,&size):TOM_MEMORY;
 yyjson_doc *doc=!e?yyjson_read((char*)bytes,size,0):NULL;yyjson_val *m=doc?yyjson_doc_get_root(doc):NULL;yyjson_val *files=m?yyjson_obj_get(m,"arquivos"):NULL;
 if(!e&&(!m||strcmp(str(m,"formato"),"TomSnapshot")||yyjson_get_int(yyjson_obj_get(m,"versao"))!=1||!yyjson_is_arr(files)))e=TOM_INVALID;
 char name[128];snprintf(name,sizeof(name),"restaurado-%llu",(unsigned long long)SDL_GetTicksNS());char *final=tom_file_join(parent,name);strcat(name,".partial");char *staging=tom_file_join(parent,name);char hash[65];if(!final||!staging)e=TOM_MEMORY;
 if(!e)e=hash_string(db,hash);if(!e&&strcmp(hash,str(m,"banco_hash")))e=TOM_INVALID;if(!e)e=integrity(db);if(!e)e=tom_file_mkdir(staging);
 size_t i,n;yyjson_val *item;if(!e)yyjson_arr_foreach(files,i,n,item){e=cancelled(j);const char *relative=str(item,"caminho");if(!tom_file_relative(relative)){e=TOM_INVALID;break;}char *from=tom_file_join(source,relative),*to=tom_file_join(staging,relative);if(!from||!to)e=TOM_MEMORY;if(!e)e=hash_string(from,hash);if(!e&&strcmp(hash,str(item,"hash")))e=TOM_INVALID;if(!e)e=make_parent(to);if(!e)e=tom_file_copy(from,to);if(!e)e=hash_string(to,hash);if(!e&&strcmp(hash,str(item,"hash")))e=TOM_INVALID;free(from);free(to);if(e)break;atomic_store(&j->progress,(int)((i+1)*80/(n?n:1)));}
 char *target=staging?tom_file_join(staging,"dados.sqlite"):NULL;if(!target&&!e)e=TOM_MEMORY;if(!e)e=tom_file_copy(db,target);if(!e)e=hash_string(target,hash);if(!e&&strcmp(hash,str(m,"banco_hash")))e=TOM_INVALID;if(!e)e=integrity(target);if(!e)e=cancelled(j);if(!e)e=tom_file_publish(staging,final,0);
 if(!e){yyjson_mut_doc *r=yyjson_mut_doc_new(NULL);yyjson_mut_val *v=r?yyjson_mut_obj(r):NULL;if(!v)e=TOM_MEMORY;else{yyjson_mut_doc_set_root(r,v);yyjson_mut_obj_add_strcpy(r,v,"destino",final);e=set_result(j,r);}yyjson_mut_doc_free(r);}else if(staging)remove_tree(staging);
 free(target);free(final);free(staging);free(manifest_path);free(db);free(bytes);yyjson_doc_free(doc);return e;
}
static int worker(void *argument){TomFileJob *j=argument;yyjson_doc *doc=yyjson_read(j->request,strlen(j->request),0);yyjson_val *root=doc?yyjson_doc_get_root(doc):NULL;const char *operation=root?str(root,"operacao"):"";int32_t e=TOM_INVALID;
 if(!strcmp(operation,"importar"))e=import_document(j,root);else if(!strcmp(operation,"ler_planilha"))e=read_spreadsheet(j,root);else if(!strcmp(operation,"exportar"))e=export_document(j,root);else if(!strcmp(operation,"backup"))e=snapshot(j,root);else if(!strcmp(operation,"restaurar"))e=restore(j,root);
 yyjson_doc_free(doc);if(e&&!j->message[0])snprintf(j->message,sizeof(j->message),"%s (código %d). %s",e==TOM_LATE?"Operação cancelada":"Não foi possível concluir a operação",e,SDL_GetError());atomic_store(&j->error,e);atomic_store(&j->progress,e?atomic_load(&j->progress):100);atomic_store(&j->state,e==TOM_LATE?3:e?2:1);return 0;
}
void tom_file_job_free(TomFileJob *j){if(!j)return;atomic_store(&j->cancel,1);if(j->thread)SDL_WaitThread(j->thread,NULL);free(j->request);free(j->result);free(j);tom_object_released();}
int32_t tom_file_job_new(const char *request,TomFileJob **out){if(!out||!tom_utf8_valid(request)||strlen(request)>268435456)return TOM_INVALID;yyjson_doc *doc=yyjson_read(request,strlen(request),0);int valid=doc&&yyjson_is_obj(yyjson_doc_get_root(doc));yyjson_doc_free(doc);if(!valid)return TOM_INVALID;
 TomFileJob *j=calloc(1,sizeof(*j));if(!j)return TOM_MEMORY;j->request=malloc(strlen(request)+1);if(!j->request){free(j);return TOM_MEMORY;}strcpy(j->request,request);j->thread=SDL_CreateThread(worker,"tom-files",j);if(!j->thread){free(j->request);free(j);return TOM_RESOURCE;}tom_object_acquired();tom_file_job_free(*out);*out=j;return TOM_OK;}
int32_t tom_file_job_field(TomFileJob *j,int32_t field,int32_t *out){if(!j||!out)return TOM_INVALID;switch(field){case 0:*out=atomic_load(&j->state);break;case 1:*out=atomic_load(&j->progress);break;case 2:*out=atomic_load(&j->error);break;default:return TOM_BOUNDS;}return TOM_OK;}
int32_t tom_file_job_result(TomFileJob *j,TomText *out){if(!j||!atomic_load(&j->state))return TOM_INVALID;return tom_text_set(out,j->result?j->result:"{}");}
int32_t tom_file_job_message(TomFileJob *j,TomText *out){if(!j||!atomic_load(&j->state))return TOM_INVALID;return tom_text_set(out,j->message);}
int32_t tom_file_job_cancel(TomFileJob *j){if(!j)return TOM_INVALID;atomic_store(&j->cancel,1);return TOM_OK;}
