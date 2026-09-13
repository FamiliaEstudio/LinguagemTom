'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs');const os=require('node:os');const path=require('node:path');const{spawnSync}=require('node:child_process');
const{toolchain,linkArguments,copyAssets}=require('../core/native-build');const{command}=require('./helpers');
for(const optimize of ['-O0','-O2'])test(`0.4 native catalogs, pointer events and coherent audio clock ${optimize}`,()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'tom-native-04-'));
  try{
    const exe=path.join(dir,process.platform==='win32'?'native.exe':'native');
    command(toolchain().clang,[optimize,'-Wall','-Wextra','-Werror','-DTOM_AUDIO_TEST','-DTOM_UI_TEST','-I',path.join(__dirname,'../runtime/stable'),path.join(__dirname,'runtime-04.c'),...linkArguments(['ui','audio']),'-o',exe]);
    copyAssets(dir,['ui','audio']);fs.mkdirSync(path.join(dir,'assets'),{recursive:true});
    const wav=Buffer.alloc(44+480*2);wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(48000,24);wav.writeUInt32LE(96000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(960,40);for(let i=44;i<wav.length;i+=2)wav.writeInt16LE(8192,i);
    fs.writeFileSync(path.join(dir,'assets/constant.wav'),wav);
    const r=spawnSync(exe,[],{encoding:'utf8',timeout:30000,env:{...process.env,SDL_VIDEODRIVER:'dummy',SDL_RENDER_DRIVER:'software',SDL_AUDIODRIVER:'dummy'}});
    assert.ifError(r.error);assert.equal(r.status,0,r.stdout+r.stderr);assert.equal(r.stdout.trim(),'runtime-04-ok');
  }finally{fs.rmSync(dir,{recursive:true,force:true,maxRetries:10,retryDelay:100});}
});
