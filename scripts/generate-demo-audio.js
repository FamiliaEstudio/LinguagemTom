'use strict';
// Original synthetic accompaniment, with no recorded third-party samples.
const fs=require('node:fs');
const path=require('node:path');
const rate=48000,frames=rate*2,bytes=Buffer.alloc(44+frames*2);
bytes.write('RIFF');bytes.writeUInt32LE(bytes.length-8,4);bytes.write('WAVEfmt ',8);
bytes.writeUInt32LE(16,16);bytes.writeUInt16LE(1,20);bytes.writeUInt16LE(1,22);
bytes.writeUInt32LE(rate,24);bytes.writeUInt32LE(rate*2,28);bytes.writeUInt16LE(2,32);bytes.writeUInt16LE(16,34);
bytes.write('data',36);bytes.writeUInt32LE(frames*2,40);
for(let i=0;i<frames;i++) {
  const t=i/rate,local=t%0.5;
  const pulse=Math.sin(2*Math.PI*880*t)*Math.exp(-local*70)*0.16;
  // Integer-cycle frequencies make the two-second boundary continuous.
  const pad=(Math.sin(2*Math.PI*130.5*t)+Math.sin(2*Math.PI*196*t))*0.12;
  bytes.writeInt16LE(Math.round((pulse+pad)*32767),44+i*2);
}
const file=path.join(__dirname,'../tom-lang/exemplos/multimedia/assets/acompanhamento.wav');
fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,bytes);
console.log(file);
