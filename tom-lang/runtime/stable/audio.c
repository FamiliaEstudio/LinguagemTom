#include "platform.h"
#include "catalog.h"
#include <math.h>
#include <stdlib.h>
#include <string.h>

#define RATE 48000
#define CHANNELS 32
#define COMMANDS 256
#define FADE 240
#define TAU 6.283185307179586476925286766559
typedef struct {
  int kind, repeat, release;
  int64_t position, duration;
  double phase, frequency, gain;
  TomSound *sound;
} Voice;
typedef struct { Voice voice, tail; double gain; } Channel;
typedef struct { int64_t at; int channel, stop; Voice voice; } AudioCommand;
struct TomAudio {
  SDL_AudioStream *stream;
  SDL_ThreadID thread;
  int references, closed, paused, status, device;
  int64_t position, anchor_frame, anchor_ns, latency;
  double gain;
  Channel channels[CHANNELS];
  AudioCommand commands[COMMANDS];
  size_t count;
};
struct TomSound { TomAudio *owner; float *samples; int64_t frames; };
static int32_t valid(TomAudio *a) {
  if (!a || a->closed || a->thread != SDL_GetCurrentThreadID()) return TOM_RESOURCE;
  return TOM_OK;
}
static int32_t lock(TomAudio *a) {
  int32_t error = valid(a); if (error) return error;
  if (a->stream && !SDL_LockAudioStream(a->stream)) return TOM_RESOURCE;
  return TOM_OK;
}
static void unlock(TomAudio *a) { if (a->stream) SDL_UnlockAudioStream(a->stream); }
static void release_audio(TomAudio *a) { if (!--a->references) { free(a); tom_object_released(); } }
static int32_t channel_index(int32_t channel) { return channel >= 0 && channel < CHANNELS ? TOM_OK : TOM_BOUNDS; }
static int gain_valid(double gain) { return isfinite(gain) && gain >= 0 && gain <= 1; }

static void voice_sample(Voice *v, double *left, double *right) {
  *left = *right = 0;
  if (!v->kind) return;
  double envelope = v->position < FADE ? (double)v->position / FADE : 1;
  if (v->kind == 1) {
    if (v->position >= v->duration) { v->kind = 0; return; }
    if (v->duration - v->position < FADE) envelope = fmin(envelope, (double)(v->duration-v->position)/FADE);
    *left = *right = sin(v->phase);
    v->phase += TAU * v->frequency / RATE;
    if (v->phase >= TAU) v->phase -= TAU;
  } else {
    if (v->position >= v->sound->frames) {
      if (!v->repeat) { v->kind = 0; return; }
      v->position = 0;
    }
    *left = v->sound->samples[v->position*2]; *right = v->sound->samples[v->position*2+1];
    // A loop preserves the WAV samples, without imposing a fade at each repeat.
    if (v->repeat) envelope = 1;
    else if (v->sound->frames-v->position < FADE) envelope = fmin(envelope,(double)(v->sound->frames-v->position)/FADE);
  }
  if (v->release) envelope *= (double)v->release / FADE;
  *left *= v->gain * envelope; *right *= v->gain * envelope;
  v->position++;
  if (v->release && !--v->release) v->kind = 0;
}
static void apply(TomAudio *a, const AudioCommand *command) {
  Channel *channel = &a->channels[command->channel];
  channel->tail = channel->voice;
  if (channel->tail.kind) channel->tail.release = FADE;
  channel->voice = command->stop ? (Voice){0} : command->voice;
}
// The same bounded mixer is used by the device callback and offline tests.
static void mix(TomAudio *a, float *samples, int frames) {
  memset(samples,0,(size_t)frames*2*sizeof(float));
  if (a->paused || a->status) return;
  if (a->position > INT64_MAX-frames) { a->status=TOM_OVERFLOW; return; }
  int active=0;for(int c=0;c<CHANNELS;c++)active|=a->channels[c].voice.kind|a->channels[c].tail.kind;
  if(!active && (!a->count || a->commands[0].at>=a->position+frames)) { a->position+=frames; return; }
  for (int i=0;i<frames;i++) {
    while (a->count && a->commands[0].at <= a->position) {
      apply(a,&a->commands[0]);
      memmove(a->commands,a->commands+1,(--a->count)*sizeof(*a->commands));
    }
    double left=0,right=0;
    for (int c=0;c<CHANNELS;c++) {
      double l,r,tl,tr;
      voice_sample(&a->channels[c].voice,&l,&r); voice_sample(&a->channels[c].tail,&tl,&tr);
      left += (l+tl)*a->channels[c].gain; right += (r+tr)*a->channels[c].gain;
    }
    samples[i*2]=(float)fmax(-1,fmin(1,left*a->gain));
    samples[i*2+1]=(float)fmax(-1,fmin(1,right*a->gain)); a->position++;
  }
}
static void SDLCALL callback(void *userdata, SDL_AudioStream *stream, int additional, int total) {
  (void)total; TomAudio *a=userdata;
  if (additional <= 0) return;
  int64_t now;
  if (!a->paused && !tom_time_now(&now)) { a->anchor_ns=now; a->anchor_frame=a->position; }
  int frames=additional/8+(additional%8!=0); float scratch[256*2];
  while (frames>0) {
    int chunk=frames>256?256:frames; mix(a,scratch,chunk);
    if (!SDL_PutAudioStreamData(stream,scratch,chunk*8)) { a->status=TOM_RESOURCE; return; }
    frames-=chunk;
  }
}
static int32_t create(TomAudio **out, int device) {
  if (!out) return TOM_INVALID;
  int32_t error; int64_t now;
  if ((error=tom_time_now(&now))) return error;
  if (device && (error=tom_sdl_acquire(SDL_INIT_AUDIO))) return error;
  TomAudio *a=calloc(1,sizeof(*a));
  if (!a) { if(device)tom_sdl_release(SDL_INIT_AUDIO); return TOM_MEMORY; }
  a->references=1; a->thread=SDL_GetCurrentThreadID(); a->paused=1; a->gain=1; a->anchor_ns=now; a->device=device;
  for(int i=0;i<CHANNELS;i++) a->channels[i].gain=1;
  if(device) {
    SDL_AudioSpec spec={SDL_AUDIO_F32,2,RATE};
    a->stream=SDL_OpenAudioDeviceStream(SDL_AUDIO_DEVICE_DEFAULT_PLAYBACK,&spec,callback,a);
    if(!a->stream || !SDL_ResumeAudioStreamDevice(a->stream)) {
      if(a->stream)SDL_DestroyAudioStream(a->stream); free(a); tom_sdl_release(SDL_INIT_AUDIO); return TOM_RESOURCE;
    }
  }
  tom_object_acquired(); tom_audio_free(*out); *out=a; return TOM_OK;
}
int32_t tom_audio_new(TomAudio **out) { return create(out,1); }
void tom_audio_free(TomAudio *a) {
  if(!a)return;
  // DestroyAudioStream synchronizes with an in-flight callback before returning.
  if(a->stream) { SDL_DestroyAudioStream(a->stream); a->stream=NULL; }
  a->closed=1; a->count=0; memset(a->channels,0,sizeof(a->channels));
  if(a->device)tom_sdl_release(SDL_INIT_AUDIO);
  release_audio(a);
}
int32_t tom_audio_pause(TomAudio *a, int32_t paused) {
  if(paused!=0 && paused!=1)return TOM_INVALID;
  int32_t error=lock(a); if(error)return error;
  if(!paused && a->paused) { int64_t now; error=tom_time_now(&now); if(!error){a->anchor_ns=now;a->anchor_frame=a->position;} }
  if(!error)a->paused=paused;
  unlock(a);return error;
}
int32_t tom_audio_volume(TomAudio *a,double gain) {
  if(!gain_valid(gain))return TOM_INVALID;
  int32_t error=lock(a);if(error)return error;a->gain=gain;unlock(a);return TOM_OK;
}
int32_t tom_audio_channel_volume(TomAudio *a,int32_t channel,double gain) {
  if(channel_index(channel))return TOM_BOUNDS;if(!gain_valid(gain))return TOM_INVALID;
  int32_t error=lock(a);if(error)return error;a->channels[channel].gain=gain;unlock(a);return TOM_OK;
}
static int32_t enqueue(TomAudio *a,AudioCommand command) {
  int32_t error=lock(a);if(error)return error;
  if(a->status)error=a->status;
  else if(command.at < -1)error=TOM_INVALID;
  else if(command.at>=0 && command.at<a->position)error=TOM_LATE;
  else if(a->count==COMMANDS)error=TOM_CAPACITY;
  else {
    if(command.at==-1)command.at=a->position;
    size_t at=a->count;
    while(at && a->commands[at-1].at>command.at){a->commands[at]=a->commands[at-1];at--;}
    a->commands[at]=command;a->count++;
  }
  unlock(a);return error;
}
int32_t tom_audio_tone_at(TomAudio *a,int32_t channel,double frequency,double gain,int64_t duration,int64_t at) {
  if(channel_index(channel))return TOM_BOUNDS;
  if(!isfinite(frequency)||frequency<=0||frequency>=RATE/2||!gain_valid(gain)||duration<=0)return TOM_INVALID;
  __int128 frames=((__int128)duration*RATE+999999999)/1000000000;
  if(frames>INT64_MAX)return TOM_OVERFLOW;
  AudioCommand c={.at=at,.channel=channel,.voice={.kind=1,.duration=(int64_t)frames,.frequency=frequency,.gain=gain}};
  return enqueue(a,c);
}
int32_t tom_audio_tone(TomAudio *a,int32_t channel,double frequency,double gain,int64_t duration) { return tom_audio_tone_at(a,channel,frequency,gain,duration,-1); }
int32_t tom_audio_sound_at(TomAudio *a,TomSound *sound,int32_t channel,double gain,int32_t repeat,int64_t at) {
  if(!sound || sound->owner!=a || !gain_valid(gain) || (repeat!=0 && repeat!=1))return TOM_INVALID;
  if(channel_index(channel))return TOM_BOUNDS;
  AudioCommand c={.at=at,.channel=channel,.voice={.kind=2,.sound=sound,.gain=gain,.repeat=repeat}};
  return enqueue(a,c);
}
int32_t tom_audio_sound(TomAudio *a,TomSound *s,int32_t channel,double gain,int32_t repeat) { return tom_audio_sound_at(a,s,channel,gain,repeat,-1); }
int32_t tom_audio_stop(TomAudio *a,int32_t channel) {
  if(channel_index(channel))return TOM_BOUNDS;
  int32_t error=lock(a);if(error)return error;
  // Stopping a channel also cancels its future commands; other channels survive.
  size_t n=0;for(size_t i=0;i<a->count;i++)if(a->commands[i].channel!=channel)a->commands[n++]=a->commands[i];a->count=n;
  AudioCommand c={.channel=channel,.stop=1};apply(a,&c);unlock(a);return TOM_OK;
}
int32_t tom_audio_position(TomAudio *a,int64_t *out) {
  if(!out)return TOM_INVALID;int32_t error=lock(a);if(error)return error;*out=a->position;unlock(a);return TOM_OK;
}
int32_t tom_audio_check(TomAudio *a) { int32_t error=lock(a);if(error)return error;error=a->status;unlock(a);return error; }
int32_t tom_audio_latency(TomAudio *a,int64_t ns) { int32_t error=lock(a);if(error)return error;a->latency=ns;unlock(a);return TOM_OK; }
int32_t tom_audio_frame_time(TomAudio *a,int64_t frame,int64_t *out) {
  if(!out||frame<0)return TOM_INVALID;int32_t error=lock(a);if(error)return error;
  __int128 value=(__int128)a->anchor_ns+a->latency+((__int128)frame-a->anchor_frame)*1000000000/RATE;
  if(value<0 || value>INT64_MAX)error=TOM_OVERFLOW;else *out=(int64_t)value;
  unlock(a);return error;
}
int32_t tom_audio_time_frame(TomAudio *a,int64_t ns,int64_t *out) {
  if(!out||ns<0)return TOM_INVALID;int32_t error=lock(a);if(error)return error;
  __int128 value=(__int128)a->anchor_frame+((__int128)ns-a->anchor_ns-a->latency)*RATE/1000000000;
  if(value<0 || value>INT64_MAX)error=TOM_OVERFLOW;else *out=(int64_t)value;
  unlock(a);return error;
}

static uint32_t u32(const Uint8 *p) { return (uint32_t)p[0]|((uint32_t)p[1]<<8)|((uint32_t)p[2]<<16)|((uint32_t)p[3]<<24); }
static uint16_t u16(const Uint8 *p) { return (uint16_t)(p[0]|((uint16_t)p[1]<<8)); }
// Preflight PCM sizes before SDL allocates or converts sample buffers.
static int32_t wav_sizes(SDL_IOStream *io,uint64_t limit) {
  Sint64 size=SDL_GetIOSize(io);Uint8 head[12];
  if(size<12 || SDL_ReadIO(io,head,12)!=12 || memcmp(head,"RIFF",4)||memcmp(head+8,"WAVE",4))return TOM_INVALID;
  uint64_t end=(uint64_t)u32(head+4)+8;if(end>(uint64_t)size)return TOM_INVALID;
  uint32_t rate=0,data=0;uint16_t channels=0,bits=0,format=0,align=0;
  uint64_t pos=12;
  while(pos+8<=end) {
    Uint8 chunk[8];if(SDL_ReadIO(io,chunk,8)!=8)return TOM_INVALID;
    uint32_t n=u32(chunk+4);pos+=8;if(pos+n>end)return TOM_INVALID;
    if(!memcmp(chunk,"fmt ",4)) {
      if(format)return TOM_INVALID;
      Uint8 f[16];if(n<16 || SDL_ReadIO(io,f,16)!=16)return TOM_INVALID;
      format=u16(f);channels=u16(f+2);rate=u32(f+4);align=u16(f+12);bits=u16(f+14);
    } else if(!memcmp(chunk,"data",4)) { if(data)return TOM_INVALID; data=n; }
    pos+=(uint64_t)n+(n&1);if(SDL_SeekIO(io,(Sint64)pos,SDL_IO_SEEK_SET)<0)return TOM_INVALID;
  }
  if((format!=1 && format!=3)||channels<1||channels>2||rate<8000||rate>192000||!data)return TOM_INVALID;
  if((format==1 && bits!=8 && bits!=16 && bits!=24 && bits!=32)||(format==3 && bits!=32))return TOM_INVALID;
  if(align!=channels*(bits/8)||data%align)return TOM_INVALID;
  uint64_t frames=((uint64_t)(data/align)*RATE+rate-1)/rate;
  if(data>limit || frames>INT32_MAX/8 || frames*8>limit)return TOM_CAPACITY;
  if(SDL_SeekIO(io,0,SDL_IO_SEEK_SET)<0)return TOM_RESOURCE;return TOM_OK;
}
int32_t tom_sound_new(TomAudio *a,const char *relative,uint64_t limit,TomSound **out) {
  int32_t error=valid(a);if(error)return error;
  if(!out||!limit||limit>INT32_MAX)return TOM_INVALID;
  char *file=NULL;error=tom_asset_path(relative,&file);if(error)return error;
  SDL_IOStream *io=SDL_IOFromFile(file,"rb");free(file);if(!io)return TOM_RESOURCE;
  error=wav_sizes(io,limit);if(error){SDL_CloseIO(io);return error;}
  SDL_AudioSpec spec;Uint8 *raw=NULL;Uint32 bytes=0;
  if(!SDL_LoadWAV_IO(io,true,&spec,&raw,&bytes))return TOM_INVALID;
  SDL_AudioSpec target={SDL_AUDIO_F32,2,RATE};Uint8 *converted=NULL;int length=0;
  if(bytes>INT32_MAX || !SDL_ConvertAudioSamples(&spec,raw,(int)bytes,&target,&converted,&length))error=TOM_RESOURCE;
  SDL_free(raw);
  if(!error && (length<=0 || length%8 || (uint64_t)length>limit))error=TOM_CAPACITY;
  if(!error)for(int i=0;i<length/4;i++)if(!isfinite(((float*)converted)[i])){error=TOM_INVALID;break;}
  if(error){SDL_free(converted);return error;}
  TomSound *sound=calloc(1,sizeof(*sound));if(!sound){SDL_free(converted);return TOM_MEMORY;}
  sound->samples=(float*)converted;sound->frames=length/8;sound->owner=a;a->references++;
  tom_object_acquired();tom_sound_free(*out);*out=sound;return TOM_OK;
}
void tom_sound_free(TomSound *s) {
  if(!s)return;TomAudio *a=s->owner;
  if(a->stream && !SDL_LockAudioStream(a->stream)) {
    // Quiesce the callback before releasing PCM even when locking fails.
    SDL_DestroyAudioStream(a->stream);a->stream=NULL;a->status=TOM_RESOURCE;
  }
  for(int i=0;i<CHANNELS;i++) {
    if(a->channels[i].voice.sound==s)a->channels[i].voice=(Voice){0};
    if(a->channels[i].tail.sound==s)a->channels[i].tail=(Voice){0};
  }
  size_t n=0;for(size_t i=0;i<a->count;i++)if(a->commands[i].voice.sound!=s)a->commands[n++]=a->commands[i];a->count=n;
  if(a->stream)SDL_UnlockAudioStream(a->stream);
  SDL_free(s->samples);free(s);tom_object_released();release_audio(a);
}
int32_t tom_audio_clock(TomAudio *a,TomAudioClock *out) {
  if(!out)return TOM_INVALID;int32_t error=lock(a);if(error)return error;
  TomAudioClock snapshot={a->position,a->anchor_frame,a->anchor_ns,a->latency,(uint8_t)a->paused};
  unlock(a);*out=snapshot;return TOM_OK;
}

struct TomSoundCatalog { TomCatalog slots; TomAudio *owner; };
void tom_sound_catalog_free(TomSoundCatalog *catalog) {
  if(!catalog)return;
  for(int32_t i=0;i<catalog->slots.capacity;i++)tom_sound_free(catalog->slots.entries[i].value);
  free(catalog->slots.entries);release_audio(catalog->owner);free(catalog);tom_object_released();
}
int32_t tom_sound_catalog_new(TomAudio *owner,int32_t capacity,TomSoundCatalog **out) {
  int32_t error=valid(owner);if(error)return error;if(!out)return TOM_INVALID;
  TomSoundCatalog *catalog=calloc(1,sizeof(*catalog));if(!catalog)return TOM_MEMORY;
  error=tom_catalog_init(&catalog->slots,capacity);if(error){free(catalog);return error;}
  catalog->owner=owner;owner->references++;tom_object_acquired();tom_sound_catalog_free(*out);*out=catalog;return TOM_OK;
}
int32_t tom_sound_catalog_load(TomSoundCatalog *catalog,const char *file,uint64_t limit,int64_t *out) {
  if(!catalog || !out)return TOM_INVALID;int32_t error=valid(catalog->owner);if(error)return error;
  TomCatalogEntry *entry=tom_catalog_empty(&catalog->slots);if(!entry)return TOM_CAPACITY;
  int64_t id;error=tom_handle_next(&id);if(error)return error;
  TomSound *sound=NULL;error=tom_sound_new(catalog->owner,file,limit,&sound);if(error)return error;
  entry->value=sound;entry->id=id;*out=id;return TOM_OK;
}
int32_t tom_sound_catalog_replace(TomSoundCatalog *catalog,int64_t id,const char *file,uint64_t limit) {
  if(!catalog)return TOM_INVALID;int32_t error=valid(catalog->owner);if(error)return error;
  TomCatalogEntry *entry=tom_catalog_find(&catalog->slots,id);if(!entry)return TOM_RESOURCE;
  TomSound *sound=NULL;error=tom_sound_new(catalog->owner,file,limit,&sound);if(error)return error;
  tom_sound_free(entry->value);entry->value=sound;return TOM_OK;
}
int32_t tom_sound_catalog_remove(TomSoundCatalog *catalog,int64_t id) {
  if(!catalog)return TOM_INVALID;int32_t error=valid(catalog->owner);if(error)return error;
  TomCatalogEntry *entry=tom_catalog_find(&catalog->slots,id);if(!entry)return TOM_RESOURCE;
  tom_sound_free(entry->value);*entry=(TomCatalogEntry){0};return TOM_OK;
}
int32_t tom_sound_catalog_play(TomSoundCatalog *catalog,int64_t id,int32_t channel,double gain,int32_t repeat) {
  if(!catalog)return TOM_INVALID;TomCatalogEntry *entry=tom_catalog_find(&catalog->slots,id);
  return entry?tom_audio_sound(catalog->owner,entry->value,channel,gain,repeat):TOM_RESOURCE;
}
int32_t tom_sound_catalog_at(TomSoundCatalog *catalog,int64_t id,int32_t channel,double gain,int32_t repeat,int64_t at) {
  if(!catalog)return TOM_INVALID;TomCatalogEntry *entry=tom_catalog_find(&catalog->slots,id);
  return entry?tom_audio_sound_at(catalog->owner,entry->value,channel,gain,repeat,at):TOM_RESOURCE;
}
#ifdef TOM_AUDIO_TEST
int32_t tom_audio_test_new(TomAudio **out) { return create(out,0); }
int32_t tom_audio_test_render(TomAudio *a,float *samples,int32_t frames) {
  if(!samples||frames<0)return TOM_INVALID;int32_t error=lock(a);if(error)return error;
  mix(a,samples,frames);error=a->status;unlock(a);return error;
}
#endif
