'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {toolchain,linkArguments,copyAssets}=require('../core/native-build');
const {command}=require('./helpers');
function wav(samples,format=1,bits=16) {
  const bytes=bits/8,data=Buffer.alloc(44+samples.length*bytes);
  data.write('RIFF');data.writeUInt32LE(data.length-8,4);data.write('WAVEfmt ',8);data.writeUInt32LE(16,16);data.writeUInt16LE(format,20);data.writeUInt16LE(1,22);data.writeUInt32LE(48000,24);data.writeUInt32LE(48000*bytes,28);data.writeUInt16LE(bytes,32);data.writeUInt16LE(bits,34);data.write('data',36);data.writeUInt32LE(samples.length*bytes,40);
  samples.forEach((v,i)=>format===3?data.writeFloatLE(v,44+i*bytes):data.writeInt16LE(v,44+i*bytes));return data;
}
for(const optimize of ['-O0','-O2'])test(`multimedia ABI, sample scheduling, keyboard, glyphs and independent devices (${optimize})`,()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'tom-multimedia-'));
  try {
    const binary=path.join(dir,process.platform==='win32'?'test.exe':'test'),runtime=path.join(__dirname,'../runtime/stable');
    command(toolchain().clang,[optimize,'-Wall','-Wextra','-Werror','-DTOM_AUDIO_TEST','-DTOM_UI_TEST','-I',runtime,path.join(__dirname,'runtime-03.c'),...linkArguments(['ui','audio','math']),'-o',binary]);
    copyAssets(dir,['ui','audio'],['tom/Bravura.otf','tom/Bravura.LICENSE']);
    fs.writeFileSync(path.join(dir,'assets/constant.wav'),wav(Array(480).fill(8192)));
    fs.writeFileSync(path.join(dir,'assets/nan.wav'),wav([NaN],3,32));fs.writeFileSync(path.join(dir,'assets/bad.wav'),'invalid');
    const result=spawnSync(binary,[],{env:{...process.env,SDL_VIDEODRIVER:'dummy',SDL_RENDER_DRIVER:'software',SDL_AUDIODRIVER:'dummy'},encoding:'utf8',timeout:30000});
    assert.ifError(result.error);assert.equal(result.status,0,result.stderr+result.stdout);assert.equal(result.stdout.trim(),'multimedia-ok');
  } finally {fs.rmSync(dir,{recursive:true,force:true,maxRetries:10,retryDelay:100});}
});
