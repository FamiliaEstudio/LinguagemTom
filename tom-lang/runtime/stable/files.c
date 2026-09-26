#ifndef _WIN32
#define _GNU_SOURCE
#define _POSIX_C_SOURCE 200809L
#endif
#include "file_io.h"
#define SDL_MAIN_HANDLED
#include <SDL3/SDL.h>
#include <stdlib.h>
#include <string.h>
#include <errno.h>
#include <stdatomic.h>
#ifdef _WIN32
#include <windows.h>
#include <io.h>
#else
#include <unistd.h>
#include <fcntl.h>
#endif
#ifdef _WIN32
static wchar_t *wide(const char *s){int n=MultiByteToWideChar(CP_UTF8,MB_ERR_INVALID_CHARS,s,-1,NULL,0);wchar_t *w=n?malloc((size_t)n*sizeof(*w)):NULL;if(w&&!MultiByteToWideChar(CP_UTF8,MB_ERR_INVALID_CHARS,s,-1,w,n)){free(w);w=NULL;}return w;}
FILE *tom_file_open(const char *path,const char *mode){wchar_t *p=wide(path),*m=wide(mode);FILE *f=p&&m?_wfopen(p,m):NULL;free(p);free(m);return f;}
#else
FILE *tom_file_open(const char *path,const char *mode){return fopen(path,mode);}
#endif
int tom_file_relative(const char *path){
 if(!path||!*path||!tom_utf8_valid(path)||*path=='/'||strchr(path,'\\')||strchr(path,':'))return 0;
 for(const char *p=path;p;){const char *q=strchr(p,'/');size_t n=q?(size_t)(q-p):strlen(p);if(!n||(n==1&&*p=='.')||(n==2&&!memcmp(p,"..",2)))return 0;p=q?q+1:NULL;}return 1;
}
char *tom_file_join(const char *root,const char *relative){size_t a=strlen(root),b=strlen(relative);if(a>SIZE_MAX-b-2)return NULL;char *p=malloc(a+b+2);if(p)snprintf(p,a+b+2,"%s/%s",root,relative);return p;}
int32_t tom_file_mkdir(const char *path){if(!tom_utf8_valid(path)||!*path)return TOM_INVALID;return SDL_CreateDirectory(path)?TOM_OK:TOM_RESOURCE;}
int32_t tom_file_exists(const char *path,int32_t *out){if(!out||!tom_utf8_valid(path)||!*path)return TOM_INVALID;SDL_PathInfo info;*out=SDL_GetPathInfo(path,&info);return TOM_OK;}
int32_t tom_file_user_path(const char *organization,const char *app,TomText *out){
 if(!tom_utf8_valid(organization)||!tom_utf8_valid(app)||strpbrk(organization,"/\\")||strpbrk(app,"/\\"))return TOM_INVALID;
 const char *override=getenv("TOM_DATA_DIRECTORY");char *path=override?SDL_strdup(override):SDL_GetPrefPath(organization,app);if(!path)return TOM_RESOURCE;
 int32_t error=tom_file_mkdir(path);if(!error)error=tom_text_set(out,path);SDL_free(path);return error;
}
int32_t tom_file_publish(const char *source,const char *destination,int32_t replace){
 if(!tom_utf8_valid(source)||!tom_utf8_valid(destination)||(replace!=0&&replace!=1))return TOM_INVALID;
#ifdef _WIN32
 wchar_t *a=wide(source),*b=wide(destination);int okay=a&&b&&MoveFileExW(a,b,MOVEFILE_WRITE_THROUGH|(replace?MOVEFILE_REPLACE_EXISTING:0));free(a);free(b);return okay?TOM_OK:TOM_RESOURCE;
#else
 int rc;
#ifdef __linux__
 rc=replace?rename(source,destination):renameat2(AT_FDCWD,source,AT_FDCWD,destination,RENAME_NOREPLACE);
 /* DrvFS does not implement RENAME_NOREPLACE. Completed snapshot directories
    are nonempty and cannot be replaced by POSIX rename. */
 if(!replace&&rc&&(errno==EINVAL||errno==ENOSYS||errno==EOPNOTSUPP)){
  SDL_PathInfo info;if(SDL_GetPathInfo(destination,&info))return TOM_CONFLICT;
  if(SDL_GetPathInfo(source,&info)&&info.type==SDL_PATHTYPE_FILE){if(link(source,destination))return errno==EEXIST?TOM_CONFLICT:TOM_RESOURCE;rc=unlink(source);}
  else rc=rename(source,destination);
 }
#else
 if(!replace){SDL_PathInfo info;if(SDL_GetPathInfo(destination,&info))return TOM_CONFLICT;}
 rc=rename(source,destination);
#endif
 if(rc)return errno==EEXIST?TOM_CONFLICT:TOM_RESOURCE;
 char *parent=strdup(destination);if(!parent)return TOM_MEMORY;char *slash=strrchr(parent,'/');if(slash){if(slash==parent)slash[1]=0;else *slash=0;}else strcpy(parent,".");
 int fd=open(parent,O_RDONLY|O_DIRECTORY);free(parent);if(fd<0)return TOM_RESOURCE;int synced=fsync(fd);close(fd);return synced?TOM_RESOURCE:TOM_OK;
#endif
}
int32_t tom_file_read_all(const char *path,uint64_t limit,unsigned char **out,size_t *size){
 if(!path||!out||!size||!tom_utf8_valid(path)||limit>INT32_MAX)return TOM_INVALID;FILE *f=tom_file_open(path,"rb");if(!f)return TOM_RESOURCE;
 size_t used=0,cap=4096;if(cap>limit)cap=(size_t)limit;unsigned char *bytes=malloc(cap+1);int32_t error=bytes?0:TOM_MEMORY;
 while(!error){if(used==cap){if(cap==limit){if(fgetc(f)!=EOF)error=TOM_CAPACITY;break;}size_t next=cap*2;if(next>limit)next=(size_t)limit;unsigned char *p=realloc(bytes,next+1);if(!p){error=TOM_MEMORY;break;}bytes=p;cap=next;}
 size_t n=fread(bytes+used,1,cap-used,f);used+=n;if(!n){if(ferror(f))error=TOM_RESOURCE;break;}}
 if(ferror(f))error=TOM_RESOURCE;fclose(f);if(error){free(bytes);return error;}bytes[used]=0;*out=bytes;*size=used;return TOM_OK;
}
static int32_t sync_file(FILE *f){if(fflush(f))return TOM_RESOURCE;
#ifdef _WIN32
 return _commit(_fileno(f))?TOM_RESOURCE:TOM_OK;
#else
 return fsync(fileno(f))?TOM_RESOURCE:TOM_OK;
#endif
}
static FILE *temporary(const char *path,char **name){static _Atomic unsigned counter;size_t n=strlen(path)+96;char *s=malloc(n);if(!s)return NULL;
 FILE *f=NULL;for(int i=0;i<20&&!f;i++){snprintf(s,n,"%s.tom-%llu-%u.tmp",path,(unsigned long long)SDL_GetTicksNS(),atomic_fetch_add(&counter,1));f=tom_file_open(s,"wbx");}if(!f){free(s);return NULL;}*name=s;return f;}
static int32_t publish_file(FILE *f,char *temp,const char *path,int32_t error){if(!error)error=sync_file(f);if(fclose(f)&&!error)error=TOM_RESOURCE;if(!error)error=tom_file_publish(temp,path,1);if(error)SDL_RemovePath(temp);free(temp);return error;}
int32_t tom_file_write_all(const char *path,const void *bytes,size_t size){
 if(!path||!tom_utf8_valid(path)||(!bytes&&size))return TOM_INVALID;char *temp=NULL;FILE *f=temporary(path,&temp);if(!f)return TOM_RESOURCE;return publish_file(f,temp,path,fwrite(bytes,1,size,f)==size?TOM_OK:TOM_RESOURCE);
}
int32_t tom_file_read_text(const char *path,TomText *out){if(!out)return TOM_INVALID;unsigned char *bytes=NULL;size_t size=0;int32_t e=tom_file_read_all(path,(out->limit?out->limit:out->capacity)-1,&bytes,&size);if(!e){if(memchr(bytes,0,size))e=TOM_INVALID;else e=tom_text_set(out,(char*)bytes);}free(bytes);return e;}
int32_t tom_file_write_text(const char *path,const char *text){return tom_utf8_valid(text)?tom_file_write_all(path,text,strlen(text)):TOM_INVALID;}
int32_t tom_file_copy(const char *source,const char *destination){
 if(!tom_utf8_valid(source)||!tom_utf8_valid(destination))return TOM_INVALID;
 FILE *in=tom_file_open(source,"rb");if(!in)return TOM_RESOURCE;char *temp=NULL;FILE *out=temporary(destination,&temp);if(!out){fclose(in);return TOM_RESOURCE;}
 unsigned char buffer[65536];size_t n;int32_t e=0;while((n=fread(buffer,1,sizeof(buffer),in))!=0)if(fwrite(buffer,1,n,out)!=n){e=TOM_RESOURCE;break;}if(ferror(in))e=TOM_RESOURCE;fclose(in);return publish_file(out,temp,destination,e);
}
/* FIPS 180-4 SHA-256; streaming input keeps originals out of UTF-8 buffers. */
typedef struct{uint32_t h[8];uint64_t bytes;size_t used;unsigned char block[64];} Hash;
static uint32_t rotr(uint32_t x,int n){return (x>>n)|(x<<(32-n));}
static void hash_block(Hash *h,const unsigned char *p){
 static const uint32_t k[64]={0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2};
 uint32_t w[64];for(int i=0;i<16;i++)w[i]=(uint32_t)p[i*4]<<24|(uint32_t)p[i*4+1]<<16|(uint32_t)p[i*4+2]<<8|p[i*4+3];
 for(int i=16;i<64;i++){uint32_t a=w[i-15],b=w[i-2];w[i]=w[i-16]+(rotr(a,7)^rotr(a,18)^(a>>3))+w[i-7]+(rotr(b,17)^rotr(b,19)^(b>>10));}
 uint32_t a=h->h[0],b=h->h[1],c=h->h[2],d=h->h[3],e=h->h[4],f=h->h[5],g=h->h[6],z=h->h[7];
 for(int i=0;i<64;i++){uint32_t t=z+(rotr(e,6)^rotr(e,11)^rotr(e,25))+((e&f)^(~e&g))+k[i]+w[i];uint32_t u=(rotr(a,2)^rotr(a,13)^rotr(a,22))+((a&b)^(a&c)^(b&c));z=g;g=f;f=e;e=d+t;d=c;c=b;b=a;a=t+u;}
 h->h[0]+=a;h->h[1]+=b;h->h[2]+=c;h->h[3]+=d;h->h[4]+=e;h->h[5]+=f;h->h[6]+=g;h->h[7]+=z;
}
static void hash_add(Hash *h,const unsigned char *p,size_t n){h->bytes+=n;while(n){size_t take=64-h->used;if(take>n)take=n;memcpy(h->block+h->used,p,take);h->used+=take;p+=take;n-=take;if(h->used==64){hash_block(h,h->block);h->used=0;}}}
int32_t tom_file_hash(const char *path,TomText *out){
 if(!tom_utf8_valid(path)||!out)return TOM_INVALID;FILE *f=tom_file_open(path,"rb");if(!f)return TOM_RESOURCE;
 Hash h={{0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19},0,0,{0}};
 unsigned char block[65536];size_t n;while((n=fread(block,1,sizeof(block),f))!=0)hash_add(&h,block,n);int error=ferror(f);fclose(f);if(error)return TOM_RESOURCE;
 uint64_t bits=h.bytes*8;unsigned char one=0x80,zero=0;hash_add(&h,&one,1);while(h.used!=56)hash_add(&h,&zero,1);unsigned char size[8];for(int i=0;i<8;i++)size[7-i]=(unsigned char)(bits>>(i*8));hash_add(&h,size,8);
 char hex[65];for(int i=0;i<8;i++)snprintf(hex+i*8,9,"%08x",h.h[i]);return tom_text_set(out,hex);
}
