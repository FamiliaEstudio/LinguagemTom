#ifndef _WIN32
#define _POSIX_C_SOURCE 200809L
#endif
#include "tom_runtime.h"
#include "platform.h"
#include <stdlib.h>
#include <string.h>
#include <stdio.h>
#include <errno.h>
#include <sys/stat.h>
#ifdef _WIN32
#include <windows.h>
#include <io.h>
#include <fcntl.h>
#include <share.h>
#include <process.h>
#else
#include <unistd.h>
#endif

struct TomUserData { char *root; };
static int component(const char *name) {
  return name && *name && tom_utf8_valid(name) && strcmp(name, ".") && strcmp(name, "..") && !strpbrk(name, "/\\:<>\"|?*\r\n\t");
}
static int32_t filename(TomUserData *data, const char *relative, char **out) {
  if (!data || !out || !tom_utf8_valid(relative) || !*relative || *relative == '/' || strpbrk(relative, "\\:<>\"|?*\r\n\t")) return TOM_INVALID;
  const char *part = relative;
  do {
    const char *slash = strchr(part, '/'); size_t n = slash ? (size_t)(slash-part) : strlen(part);
    if (!n || (n == 1 && part[0] == '.') || (n == 2 && !memcmp(part, "..", 2))) return TOM_INVALID;
    part = slash ? slash+1 : NULL;
  } while (part);
  size_t n = strlen(data->root), m = strlen(relative);
  if (m > 4096 || n > SIZE_MAX-m-1) return TOM_CAPACITY;
  char *path = malloc(n+m+1); if (!path) return TOM_MEMORY;
  memcpy(path,data->root,n); memcpy(path+n,relative,m+1); *out=path; return TOM_OK;
}
#ifdef _WIN32
static wchar_t *wide(const char *path) {
  int size=MultiByteToWideChar(CP_UTF8,MB_ERR_INVALID_CHARS,path,-1,NULL,0);
  wchar_t *out=size ? malloc((size_t)size*sizeof(wchar_t)) : NULL;
  if (out && !MultiByteToWideChar(CP_UTF8,MB_ERR_INVALID_CHARS,path,-1,out,size)) { free(out); out=NULL; }
  return out;
}
static FILE *open_read(const char *path) { wchar_t *w=wide(path); if(!w)return NULL; FILE *f=_wfopen(w,L"rb"); free(w); return f; }
#else
static FILE *open_read(const char *path) { return fopen(path,"rb"); }
#endif
void tom_data_free(TomUserData *data) { if(data) { SDL_free(data->root); free(data); tom_object_released(); } }
int32_t tom_data_new(const char *organization,const char *application,TomUserData **out) {
  if(!out || !component(organization) || !component(application)) return TOM_INVALID;
  TomUserData *data=calloc(1,sizeof(*data)); if(!data)return TOM_MEMORY;
#ifdef TOM_UI_TEST
  const char *test_directory=getenv("TOM_DATA_DIRECTORY");
  if(test_directory && *test_directory) {
    size_t length=strlen(test_directory);data->root=SDL_malloc(length+2);
    if(data->root){memcpy(data->root,test_directory,length);data->root[length]='/';data->root[length+1]=0;if(!SDL_CreateDirectory(data->root)){SDL_free(data->root);data->root=NULL;}}
  } else
#endif
  data->root=SDL_GetPrefPath(organization,application);
  if(!data->root) { free(data); return TOM_RESOURCE; }
  tom_object_acquired(); tom_data_free(*out); *out=data; return TOM_OK;
}
int32_t tom_data_exists(TomUserData *data,const char *relative,int32_t *out) {
  if(!out)return TOM_INVALID;
  char *path=NULL; int32_t error=filename(data,relative,&path); if(error)return error;
  errno=0; FILE *f=open_read(path); free(path);
  if(!f && errno!=ENOENT)return TOM_RESOURCE;
  if(f)fclose(f); *out=f ? 1 : 0; return TOM_OK;
}
int32_t tom_data_read(TomUserData *data,const char *relative,uint64_t limit,TomText *out) {
  if(!out || limit>INT32_MAX)return TOM_INVALID;
  char *path=NULL; int32_t error=filename(data,relative,&path); if(error)return error;
  FILE *f=open_read(path); free(path); if(!f)return TOM_RESOURCE;
  size_t cap=(size_t)(limit < out->capacity-1 ? limit : out->capacity-1);
  char *buffer=malloc(cap+1); if(!buffer){ fclose(f); return TOM_MEMORY; }
  size_t count=fread(buffer,1,cap,f); int extra=fgetc(f);
  if(ferror(f))error=TOM_RESOURCE;
  else if(extra!=EOF)error=TOM_CAPACITY;
  else if(memchr(buffer,0,count))error=TOM_INVALID;
  else { buffer[count]=0; error=tom_text_set(out,buffer); }
  fclose(f); free(buffer); return error;
}
int32_t tom_data_write(TomUserData *data,const char *relative,const char *text) {
  if(!tom_utf8_valid(text))return TOM_INVALID;
  char *path=NULL; int32_t error=filename(data,relative,&path); if(error)return error;
  char *temporary=malloc(strlen(path)+80); if(!temporary){free(path);return TOM_MEMORY;}
  FILE *f=NULL;
#ifdef _WIN32
  static unsigned long counter;
  for(int attempt=0;attempt<100 && !f;attempt++) {
    snprintf(temporary,strlen(path)+80,"%s.tom-%lu-%lu",path,(unsigned long)_getpid(),++counter);
    wchar_t *w=wide(temporary); int fd=-1;
    if(w && !_wsopen_s(&fd,w,_O_CREAT|_O_EXCL|_O_WRONLY|_O_BINARY,_SH_DENYRW,_S_IREAD|_S_IWRITE)) {
      f=_wfdopen(fd,L"wb"); if(!f){_close(fd);_wremove(w);}
    }
    free(w);
  }
#else
  sprintf(temporary,"%s.tom-XXXXXX",path);
  int fd=mkstemp(temporary);
  if(fd>=0) { f=fdopen(fd,"wb"); if(!f){close(fd);unlink(temporary);} }
#endif
  if(!f)error=TOM_RESOURCE;
  else {
    size_t length=strlen(text);
    if(fwrite(text,1,length,f)!=length || fflush(f))error=TOM_RESOURCE;
#ifdef _WIN32
    if(!error && _commit(_fileno(f)))error=TOM_RESOURCE;
#else
    if(!error && fsync(fileno(f)))error=TOM_RESOURCE;
#endif
    if(fclose(f))error=TOM_RESOURCE;
#ifdef _WIN32
    wchar_t *from=wide(temporary), *to=wide(path);
    if(!error && (!from || !to || !MoveFileExW(from,to,MOVEFILE_REPLACE_EXISTING|MOVEFILE_WRITE_THROUGH)))error=TOM_RESOURCE;
    if(from && error)_wremove(from); free(from); free(to);
#else
    if(!error && rename(temporary,path))error=TOM_RESOURCE;
    if(error)unlink(temporary);
#endif
  }
  free(temporary);free(path);return error;
}
