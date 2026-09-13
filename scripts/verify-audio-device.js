'use strict';
// A short real-device smoke test. Run explicitly; CI uses offline/dummy tests.
const fs=require('node:fs');
const path=require('node:path');
const {toolchain,linkArguments,copyAssets,copyProjectAssets,command,root,platform}=require('../tom-lang/core/native-build');
const directory=path.join(platform,'validation-03','device');fs.mkdirSync(directory,{recursive:true});
const source=path.join(directory,'device.c'),binary=path.join(directory,process.platform==='win32'?'device.exe':'device');
fs.writeFileSync(source,`#include "tom_runtime.h"
#include <SDL3/SDL.h>
#include <stdio.h>
#include <string.h>
int main(void) {
  TomAudio *audio=NULL;TomSound *sound=NULL;int64_t position=0;int status=tom_audio_new(&audio);
  if(status)goto done;
  const char *driver=SDL_GetCurrentAudioDriver();
  if(!driver || !strcmp(driver,"dummy") || !strcmp(driver,"disk")){status=TOM_RESOURCE;goto done;}
  status=tom_sound_new(audio,"acompanhamento.wav",1048576,&sound);if(status)goto done;
  status=tom_audio_sound(audio,sound,31,.08,1);if(status)goto done;
  status=tom_audio_tone_at(audio,0,440,.04,200000000,4800);if(status)goto done;
  status=tom_audio_pause(audio,0);if(status)goto done;
  SDL_Delay(600);status=tom_audio_check(audio);if(status)goto done;
  status=tom_audio_position(audio,&position);if(status)goto done;
  if(position<4800){status=TOM_RESOURCE;goto done;}
  printf("Real audio device: %s; processed frames: %lld\\n",driver,(long long)position);
done:
  tom_sound_free(sound);tom_audio_free(audio);
  if(status){fprintf(stderr,"Audio device validation failed: %s (%s)\\n",tom_error_message(status),SDL_GetError());return 1;}
  return tom_live_objects()?2:0;
}
`);
const native=path.join(root,'tom-lang/runtime/stable');
command(toolchain().clang,['-O2','-I',native,source,...linkArguments(['audio']),'-o',binary]);
copyAssets(directory,['audio']);
const assets=path.join(directory,'assets');fs.rmSync(assets,{recursive:true,force:true});
copyProjectAssets(path.join(root,'tom-lang/exemplos/multimedia/assets'),assets);
const env={...process.env};delete env.SDL_AUDIODRIVER;delete env.LD_LIBRARY_PATH;
env.PATH=process.platform==='win32'?`${process.env.SystemRoot}/System32;${process.env.SystemRoot}`:'/usr/bin:/bin';
const result=command(binary,[],{env,timeout:15000});
fs.writeFileSync(path.join(directory,'result.txt'),result.stdout);process.stdout.write(result.stdout);
