#ifndef _WIN32
#define _POSIX_C_SOURCE 200809L
#endif
#include "tom_runtime.h"
#include <SDL3/SDL.h>
#include <stdlib.h>
#include <string.h>
#ifdef _WIN32
#include <windows.h>
#else
#include <unistd.h>
#include <fcntl.h>
#include <poll.h>
#include <errno.h>
#include <signal.h>
#include <pthread.h>
#endif

typedef struct { char *bytes; size_t *lengths; int head,count; } Queue;
struct TomChannel {
  SDL_Mutex *mutex; SDL_Condition *wake,*readable; SDL_Thread *reader,*writer;
  Queue input,output; size_t limit,stride; int capacity,stop,ended,error,acquired;
#ifdef _WIN32
  HANDLE in,out;
#else
  int in,out,in_flags,out_flags;
#endif
};
static int active;
static int stopped(TomChannel *c) { SDL_LockMutex(c->mutex); int stop=c->stop; SDL_UnlockMutex(c->mutex); return stop; }
static void failed(TomChannel *c,int error) { SDL_LockMutex(c->mutex); if(!c->error)c->error=error; c->ended=1; SDL_BroadcastCondition(c->readable); SDL_UnlockMutex(c->mutex); }
static int receive(TomChannel *c,const char *text,size_t size) {
  if(!tom_utf8_valid(text))return TOM_INVALID;
  SDL_LockMutex(c->mutex);
  if(c->input.count==c->capacity) { SDL_UnlockMutex(c->mutex); return TOM_CAPACITY; }
  int slot=(c->input.head+c->input.count)%c->capacity;
  memcpy(c->input.bytes+(size_t)slot*c->stride,text,size+1); c->input.lengths[slot]=size; c->input.count++;
  SDL_SignalCondition(c->readable);
  SDL_UnlockMutex(c->mutex); return TOM_OK;
}
static int SDLCALL reader(void *pointer) {
  TomChannel *c=pointer; char *line=malloc(c->stride), bytes[4096]; size_t used=0;
  if(!line){failed(c,TOM_MEMORY);return 0;}
  while(!stopped(c)) {
    int count=0;
#ifdef _WIN32
    DWORD available=0,n=0;
    if(!PeekNamedPipe(c->in,NULL,0,NULL,&available,NULL)) { failed(c,used?TOM_INVALID:TOM_OK); break; }
    if(!available){SDL_Delay(10);continue;}
    if(!ReadFile(c->in,bytes,available<sizeof(bytes)?available:(DWORD)sizeof(bytes),&n,NULL)){failed(c,TOM_RESOURCE);break;}
    count=(int)n;
#else
    struct pollfd descriptor={c->in,POLLIN,0}; int ready=poll(&descriptor,1,50);
    if(ready<0){if(errno==EINTR)continue;failed(c,TOM_RESOURCE);break;}
    if(!ready)continue;
    ssize_t n=read(c->in,bytes,sizeof(bytes));
    if(n<0){if(errno==EAGAIN||errno==EINTR)continue;failed(c,TOM_RESOURCE);break;} count=(int)n;
#endif
    if(!count){failed(c,used?TOM_INVALID:TOM_OK);break;}
    for(int i=0;i<count;i++) {
      if(bytes[i]=='\n') {
        if(used && line[used-1]=='\r')used--;
        line[used]=0; int error=receive(c,line,used); used=0;
        if(error){failed(c,error);goto finished;}
      } else {
        if(!bytes[i] || used>=c->limit){failed(c,!bytes[i]?TOM_INVALID:TOM_CAPACITY);goto finished;}
        line[used++]=bytes[i];
      }
    }
  }
finished: free(line);return 0;
}
static int SDLCALL writer(void *pointer) {
  TomChannel *c=pointer;
#ifndef _WIN32
  sigset_t blocked;sigemptyset(&blocked);sigaddset(&blocked,SIGPIPE);pthread_sigmask(SIG_BLOCK,&blocked,NULL);
#endif
  while(!stopped(c)) {
    SDL_LockMutex(c->mutex);
    while(!c->stop && !c->output.count)SDL_WaitCondition(c->wake,c->mutex);
    if(c->stop){SDL_UnlockMutex(c->mutex);break;}
    int slot=c->output.head; size_t size=c->output.lengths[slot],position=0;
    char *bytes=c->output.bytes+(size_t)slot*c->stride;
    SDL_UnlockMutex(c->mutex);
    while(position<size && !stopped(c)) {
#ifdef _WIN32
      DWORD written=0;
      if(!WriteFile(c->out,bytes+position,(DWORD)(size-position),&written,NULL)){if(!stopped(c))failed(c,TOM_RESOURCE);return 0;}
      if(!written){failed(c,TOM_RESOURCE);return 0;} position+=written;
#else
      struct pollfd descriptor={c->out,POLLOUT,0};int ready=poll(&descriptor,1,50);
      if(ready<0){if(errno==EINTR)continue;failed(c,TOM_RESOURCE);return 0;}if(!ready)continue;
      ssize_t n=write(c->out,bytes+position,size-position);
      if(n<0){if(errno==EAGAIN||errno==EINTR)continue;failed(c,TOM_RESOURCE);return 0;}
      if(!n){failed(c,TOM_RESOURCE);return 0;}position+=(size_t)n;
#endif
    }
    SDL_LockMutex(c->mutex); c->output.head=(slot+1)%c->capacity;c->output.count--;SDL_UnlockMutex(c->mutex);
  }
  return 0;
}
void tom_channel_free(TomChannel *c) {
  if(!c)return;
  if(c->mutex) {
    // Give already accepted small replies a bounded opportunity to drain.
    for(int i=0;c->writer && i<20;i++){SDL_LockMutex(c->mutex);int pending=c->output.count&&!c->error;SDL_UnlockMutex(c->mutex);if(!pending)break;SDL_Delay(10);}
    SDL_LockMutex(c->mutex);c->stop=1;if(c->wake)SDL_BroadcastCondition(c->wake);SDL_UnlockMutex(c->mutex);
  }
#ifdef _WIN32
  if(c->writer) {
    HANDLE thread=OpenThread(THREAD_TERMINATE|SYNCHRONIZE,FALSE,(DWORD)SDL_GetThreadID(c->writer));
    if(thread){do{CancelSynchronousIo(thread);}while(WaitForSingleObject(thread,10)==WAIT_TIMEOUT);CloseHandle(thread);}
  }
#endif
  if(c->reader)SDL_WaitThread(c->reader,NULL);if(c->writer)SDL_WaitThread(c->writer,NULL);
#ifndef _WIN32
  if(c->in>=0){fcntl(c->in,F_SETFL,c->in_flags);close(c->in);}if(c->out>=0){fcntl(c->out,F_SETFL,c->out_flags);close(c->out);}
#endif
  if(c->wake)SDL_DestroyCondition(c->wake);if(c->readable)SDL_DestroyCondition(c->readable);if(c->mutex)SDL_DestroyMutex(c->mutex);
  free(c->input.bytes);free(c->output.bytes);free(c->input.lengths);free(c->output.lengths);
  if(c->acquired){active=0;tom_object_released();}free(c);
}
int32_t tom_channel_new(uint64_t limit,int32_t capacity,TomChannel **out) {
  if(!out||active||!limit||limit>1048576||capacity<1||capacity>32)return TOM_INVALID;
  TomChannel *c=calloc(1,sizeof(*c));if(!c)return TOM_MEMORY;
  c->limit=(size_t)limit;c->stride=(size_t)limit+1;c->capacity=capacity;
#ifndef _WIN32
  c->in=c->out=-1;
#endif
  c->mutex=SDL_CreateMutex();c->wake=SDL_CreateCondition();c->readable=SDL_CreateCondition();
  c->input.bytes=malloc(c->stride*(size_t)capacity);c->output.bytes=malloc(c->stride*(size_t)capacity);
  c->input.lengths=calloc((size_t)capacity,sizeof(size_t));c->output.lengths=calloc((size_t)capacity,sizeof(size_t));
  if(!c->mutex||!c->wake||!c->readable||!c->input.bytes||!c->output.bytes||!c->input.lengths||!c->output.lengths){tom_channel_free(c);return TOM_MEMORY;}
#ifdef _WIN32
  c->in=GetStdHandle(STD_INPUT_HANDLE);c->out=GetStdHandle(STD_OUTPUT_HANDLE);
  if(GetFileType(c->in)!=FILE_TYPE_PIPE||GetFileType(c->out)!=FILE_TYPE_PIPE){tom_channel_free(c);return TOM_RESOURCE;}
#else
  c->in=dup(STDIN_FILENO);c->out=dup(STDOUT_FILENO);
  if(c->in<0||c->out<0){tom_channel_free(c);return TOM_RESOURCE;}
  c->in_flags=fcntl(c->in,F_GETFL);c->out_flags=fcntl(c->out,F_GETFL);
  if(c->in_flags<0||c->out_flags<0||fcntl(c->in,F_SETFL,c->in_flags|O_NONBLOCK)<0||fcntl(c->out,F_SETFL,c->out_flags|O_NONBLOCK)<0){tom_channel_free(c);return TOM_RESOURCE;}
#endif
  c->reader=SDL_CreateThread(reader,"tom-channel-read",c);c->writer=SDL_CreateThread(writer,"tom-channel-write",c);
  if(!c->reader||!c->writer){tom_channel_free(c);return TOM_RESOURCE;}
  c->acquired=1;active=1;tom_object_acquired();tom_channel_free(*out);*out=c;return TOM_OK;
}
int32_t tom_channel_poll(TomChannel *c,TomText *out,int32_t *available) {
  if(!c||!out||!available)return TOM_INVALID;
  SDL_LockMutex(c->mutex);*available=0;
  if(c->input.count){int slot=c->input.head;int error=tom_text_set(out,c->input.bytes+(size_t)slot*c->stride);if(!error){c->input.head=(slot+1)%c->capacity;c->input.count--;*available=1;}SDL_UnlockMutex(c->mutex);return error;}
  int error=c->error;SDL_UnlockMutex(c->mutex);return error;
}
int32_t tom_channel_until(TomChannel *c,TomText *out,int64_t deadline,int32_t *available) {
  if(!c||!out||!available)return TOM_INVALID;
  int64_t now;int error=tom_time_now(&now);if(error)return error;
  SDL_LockMutex(c->mutex);*available=0;
  while(!c->input.count&&!c->ended&&!c->error&&!c->stop&&now<deadline) {
    int64_t remaining=deadline-now;
    int64_t ms=remaining/1000000+(remaining%1000000!=0);
    SDL_WaitConditionTimeout(c->readable,c->mutex,(int32_t)(ms>INT32_MAX?INT32_MAX:ms));
    error=tom_time_now(&now);if(error){SDL_UnlockMutex(c->mutex);return error;}
  }
  SDL_UnlockMutex(c->mutex);
  // Only the owner thread consumes messages; capacity failure leaves the queue intact.
  return tom_channel_poll(c,out,available);
}
int32_t tom_channel_send(TomChannel *c,const char *text) {
  if(!c||!tom_utf8_valid(text)||strchr(text,'\n')||strchr(text,'\r'))return TOM_INVALID;
  size_t size=strlen(text);if(size>c->limit)return TOM_CAPACITY;
  SDL_LockMutex(c->mutex);
  int error=c->error?c->error:c->output.count==c->capacity?TOM_CAPACITY:TOM_OK;
  if(!error){int slot=(c->output.head+c->output.count)%c->capacity;char *bytes=c->output.bytes+(size_t)slot*c->stride;memcpy(bytes,text,size);bytes[size]='\n';c->output.lengths[slot]=size+1;c->output.count++;SDL_SignalCondition(c->wake);}
  SDL_UnlockMutex(c->mutex);return error;
}
int32_t tom_channel_closed(TomChannel *c,int32_t *closed) {
  if(!c||!closed)return TOM_INVALID;SDL_LockMutex(c->mutex);*closed=c->ended&&!c->input.count;int error=c->error;SDL_UnlockMutex(c->mutex);return error;
}
