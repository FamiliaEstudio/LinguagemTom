#include "tom_runtime.h"
#include <yyjson.h>
#include <stdlib.h>
#include <string.h>
#include <stdio.h>
#include <inttypes.h>
#include <math.h>

struct TomJson { yyjson_doc *doc; yyjson_alc allocator; size_t used, limit; int32_t allocation_error; };
typedef union { max_align_t align; size_t size; } Allocation;
static void *allocate(void *context,size_t size) {
  TomJson *json=context;
  if(size>SIZE_MAX-sizeof(Allocation) || size+sizeof(Allocation)>json->limit-json->used){json->allocation_error=TOM_CAPACITY;return NULL;}
  Allocation *block=malloc(size+sizeof(*block)); if(!block){json->allocation_error=TOM_MEMORY;return NULL;}
  block->size=size;json->used+=size+sizeof(*block);return block+1;
}
static void release(void *context,void *pointer) {
  if(pointer){TomJson *json=context;Allocation *block=(Allocation *)pointer-1;json->used-=block->size+sizeof(*block);free(block);}
}
static void *resize(void *context,void *pointer,size_t old_size,size_t new_size) {
  (void)old_size; if(!pointer)return allocate(context,new_size);
  if(!new_size){release(context,pointer);return NULL;}
  TomJson *json=context;Allocation *block=(Allocation *)pointer-1;size_t previous=block->size;
  if(new_size>SIZE_MAX-sizeof(*block) || (new_size>previous && new_size-previous>json->limit-json->used)){json->allocation_error=TOM_CAPACITY;return NULL;}
  Allocation *next=realloc(block,new_size+sizeof(*block));if(!next){json->allocation_error=TOM_MEMORY;return NULL;}
  next->size=new_size;json->used=json->used-previous+new_size;return next+1;
}
static int valid_tree(yyjson_val *value,unsigned depth) {
  if(depth>128)return 0;
  if(yyjson_is_str(value))return strlen(yyjson_get_str(value))==yyjson_get_len(value);
  size_t i,n;yyjson_val *key,*child;
  if(yyjson_is_obj(value)) {
    yyjson_obj_foreach(value,i,n,key,child) {
      if(!valid_tree(key,depth+1) || !valid_tree(child,depth+1))return 0;
      // Count keys without converting numeric values or normalizing spelling.
      if(yyjson_obj_getn(value,yyjson_get_str(key),yyjson_get_len(key))!=child)return 0;
    }
  } else if(yyjson_is_arr(value)) { yyjson_arr_foreach(value,i,n,child) if(!valid_tree(child,depth+1))return 0; }
  return 1;
}
static int valid_path(const char *path) {
  if(!tom_utf8_valid(path) || (*path && *path!='/'))return 0;
  unsigned depth=0;
  for(const char *p=path;*p;p++) {
    if(*p=='/' && ++depth>128)return 0;
    if(*p=='~') { if(p[1]!='0' && p[1]!='1')return 0; p++; }
  }
  return 1;
}
void tom_json_free(TomJson *json) { if(json){yyjson_doc_free(json->doc);free(json);tom_object_released();} }
int32_t tom_json_read(const char *text,uint64_t limit,TomJson **out) {
  if(!out || !tom_utf8_valid(text) || limit>INT32_MAX)return TOM_INVALID;
  if(limit<sizeof(TomJson))return TOM_CAPACITY;
  TomJson *json=calloc(1,sizeof(*json));if(!json)return TOM_MEMORY;
  json->used=sizeof(*json);json->limit=(size_t)limit;json->allocator=(yyjson_alc){allocate,resize,release,json};
  yyjson_read_err error;
  json->doc=yyjson_read_opts((char *)text,strlen(text),YYJSON_READ_NUMBER_AS_RAW,&json->allocator,&error);
  int32_t status=json->allocation_error ? json->allocation_error : TOM_INVALID;
  if(!json->doc || !valid_tree(yyjson_doc_get_root(json->doc),0)){yyjson_doc_free(json->doc);free(json);return status;}
  tom_object_acquired();tom_json_free(*out);*out=json;return TOM_OK;
}
int32_t tom_json_new(uint64_t limit,TomJson **out){return tom_json_read("{}",limit,out);}
static int32_t get(TomJson *json,const char *path,yyjson_val **out) {
  if(!json || !out || !valid_path(path))return TOM_INVALID;
  yyjson_val *value=yyjson_doc_ptr_get(json->doc,path);if(!value)return TOM_BOUNDS;
  *out=value;return TOM_OK;
}
int32_t tom_json_exists(TomJson *json,const char *path,int32_t *out) {
  if(!json || !out || !valid_path(path))return TOM_INVALID;
  *out=yyjson_doc_ptr_get(json->doc,path)!=NULL;return TOM_OK;
}
int32_t tom_json_kind(TomJson *json,const char *path,int32_t *out) {
  if(!out)return TOM_INVALID;yyjson_val *v;int32_t error=get(json,path,&v);if(error)return error;
  *out=yyjson_is_null(v)?0:yyjson_is_bool(v)?1:yyjson_is_raw(v)||yyjson_is_num(v)?2:yyjson_is_str(v)?3:yyjson_is_arr(v)?4:5;return TOM_OK;
}
int32_t tom_json_length(TomJson *json,const char *path,int64_t *out) {
  if(!out)return TOM_INVALID;yyjson_val *v;int32_t error=get(json,path,&v);if(error)return error;
  if(!yyjson_is_arr(v) && !yyjson_is_obj(v))return TOM_INVALID;
  *out=(int64_t)yyjson_get_len(v);return TOM_OK;
}
int32_t tom_json_text(TomJson *json,const char *path,TomText *out) {
  yyjson_val *v;int32_t error=get(json,path,&v);if(error)return error;
  return yyjson_is_str(v)?tom_text_set(out,yyjson_get_str(v)):TOM_INVALID;
}
static const char *number(yyjson_val *v) { return yyjson_is_raw(v)?yyjson_get_raw(v):yyjson_is_str(v)?yyjson_get_str(v):NULL; }
static int32_t integer(const char *s,int is_signed,uint64_t *out) {
  if(!s || !*s)return TOM_INVALID;int negative=*s=='-';if(negative)s++;
  if(!is_signed && negative)return TOM_INVALID;
  if(!*s || (*s=='0' && s[1]))return TOM_INVALID;
  uint64_t value=0,limit=is_signed?(negative?UINT64_C(9223372036854775808):INT64_MAX):UINT64_MAX;
  for(;*s;s++){if(*s<'0'||*s>'9')return TOM_INVALID;unsigned digit=(unsigned)(*s-'0');if(value>(limit-digit)/10)return TOM_OVERFLOW;value=value*10+digit;}
  *out=negative?UINT64_C(0)-value:value;return TOM_OK;
}
int32_t tom_json_i64(TomJson *json,const char *path,int64_t *out) {
  if(!out)return TOM_INVALID;yyjson_val *v;uint64_t value;int32_t error=get(json,path,&v);if(error)return error;
  error=integer(number(v),1,&value);if(!error)memcpy(out,&value,sizeof(value));return error;
}
int32_t tom_json_u64(TomJson *json,const char *path,uint64_t *out) {
  if(!out)return TOM_INVALID;yyjson_val *v;int32_t error=get(json,path,&v);return error?error:integer(number(v),0,out);
}
int32_t tom_json_f64(TomJson *json,const char *path,double *out) {
  if(!out)return TOM_INVALID;yyjson_val *v;int32_t error=get(json,path,&v);if(error)return error;
  if(yyjson_is_num(v)){double value=yyjson_get_num(v);if(!isfinite(value))return TOM_OVERFLOW;*out=value;return TOM_OK;}
  const char *s=number(v);if(!s)return TOM_INVALID;
  yyjson_val parsed;const char *end=yyjson_read_number(s,&parsed,0,NULL,NULL);
  if(!end || *end)return TOM_INVALID;double value=yyjson_get_num(&parsed);if(!isfinite(value))return TOM_OVERFLOW;*out=value;return TOM_OK;
}
int32_t tom_json_bool(TomJson *json,const char *path,int32_t *out) {
  if(!out)return TOM_INVALID;yyjson_val *v;int32_t error=get(json,path,&v);if(error)return error;
  if(!yyjson_is_bool(v))return TOM_INVALID;*out=yyjson_get_bool(v)?1:0;return TOM_OK;
}
int32_t tom_json_decimal(TomJson *json,const char *path,TomDecimal **out) {
  yyjson_val *v;int32_t error=get(json,path,&v);if(error)return error;const char *s=number(v);
  return s?tom_decimal_parse(s,out):TOM_INVALID;
}
int32_t tom_json_write(TomJson *json,TomText *out) {
  if(!json || !out)return TOM_INVALID;json->allocation_error=0;size_t length;
  char *text=yyjson_write_opts(json->doc,YYJSON_WRITE_PRETTY,&json->allocator,&length,NULL);
  if(!text)return json->allocation_error?json->allocation_error:TOM_INVALID;
  int32_t status=tom_text_set(out,text);release(json,text);return status;
}
int32_t tom_json_extract(TomJson *json,const char *path,uint64_t limit,TomJson **out) {
  if(!out)return TOM_INVALID;yyjson_val *value;int32_t error=get(json,path,&value);if(error)return error;
  json->allocation_error=0;size_t length;
  char *text=yyjson_val_write_opts(value,0,&json->allocator,&length,NULL);
  if(!text)return json->allocation_error?json->allocation_error:TOM_INVALID;
  error=tom_json_read(text,limit,out);release(json,text);return error;
}
// Every edit uses a temporary document. Pool allocations from replaced values
// never accumulate, and failures cannot publish a partial document.
static int32_t set(TomJson *json,const char *path,int kind,const char *text,int64_t i,uint64_t u,double real,TomJson *source) {
  if(!json || !valid_path(path) || (text && !tom_utf8_valid(text)) || (kind==2 && !isfinite(real)))return TOM_INVALID;
  json->allocation_error=0;yyjson_mut_doc *copy=yyjson_doc_mut_copy(json->doc,&json->allocator);
  if(!copy)return json->allocation_error?json->allocation_error:TOM_MEMORY;
  yyjson_mut_val *value=NULL;
  switch(kind) {
    case 0:value=yyjson_mut_strcpy(copy,text);break;
    case 1:value=yyjson_mut_bool(copy,i!=0);break;
    case 2:value=yyjson_mut_real(copy,real);break;
    case 3:value=yyjson_mut_obj(copy);break;
    case 4:value=yyjson_mut_arr(copy);break;
    case 5:value=yyjson_val_mut_copy(copy,yyjson_doc_get_root(source->doc));break;
    case 6:value=yyjson_mut_null(copy);break;
    // Integer setters retain raw decimal tokens, including unsigned 64-bit max.
    case 7:case 8:{char buffer[32];if(kind==7)snprintf(buffer,sizeof(buffer),"%"PRId64,i);else snprintf(buffer,sizeof(buffer),"%"PRIu64,u);value=yyjson_mut_rawcpy(copy,buffer);break;}
  }
  int32_t error=TOM_OK;
  size_t path_length=strlen(path);
  int appended=path_length>=2 && !strcmp(path+path_length-2,"/-");
  if(!value || !(appended?yyjson_mut_doc_ptr_add(copy,path,value):yyjson_mut_doc_ptr_set(copy,path,value)))error=json->allocation_error?json->allocation_error:TOM_INVALID;
  yyjson_doc *next=error?NULL:yyjson_mut_doc_imut_copy(copy,&json->allocator);
  if(!error && !next)error=json->allocation_error?json->allocation_error:TOM_MEMORY;
  if(next && !valid_tree(yyjson_doc_get_root(next),0))error=TOM_INVALID;
  yyjson_mut_doc_free(copy);
  if(error){yyjson_doc_free(next);return error;}
  yyjson_doc_free(json->doc);json->doc=next;return TOM_OK;
}
int32_t tom_json_set_text(TomJson *j,const char *p,const char *s){return set(j,p,0,s,0,0,0,NULL);}
int32_t tom_json_set_bool(TomJson *j,const char *p,int32_t v){if(v!=0&&v!=1)return TOM_INVALID;return set(j,p,1,NULL,v,0,0,NULL);}
int32_t tom_json_set_f64(TomJson *j,const char *p,double v){return set(j,p,2,NULL,0,0,v,NULL);}
int32_t tom_json_set_object(TomJson *j,const char *p){return set(j,p,3,NULL,0,0,0,NULL);}
int32_t tom_json_set_array(TomJson *j,const char *p){return set(j,p,4,NULL,0,0,0,NULL);}
int32_t tom_json_set_document(TomJson *j,const char *p,TomJson *v){return v?set(j,p,5,NULL,0,0,0,v):TOM_INVALID;}
int32_t tom_json_set_null(TomJson *j,const char *p){return set(j,p,6,NULL,0,0,0,NULL);}
int32_t tom_json_set_i64(TomJson *j,const char *p,int64_t v){return set(j,p,7,NULL,v,0,0,NULL);}
int32_t tom_json_set_u64(TomJson *j,const char *p,uint64_t v){return set(j,p,8,NULL,0,v,0,NULL);}
int32_t tom_json_set_decimal(TomJson *j,const char *p,TomDecimal *v) {
  char text[64];TomText buffer={sizeof(text),0,text};int32_t error=tom_decimal_format(v,&buffer);
  return error?error:tom_json_set_text(j,p,text);
}
