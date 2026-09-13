'use strict';
// Renderização offline de edições livres; nenhuma regra do jogo é executada aqui.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),rate=48000;
const melodies=[
 {id:'estrelinha',title:'Brilha, Brilha, Estrelinha',author:'Tradicional; edição Fluteflute',license:'Public domain',url:'https://commons.wikimedia.org/wiki/File:Twinkle_Twinkle_Sheet_Music.png',score:'C4 C4 G4 G4 A4 A4 G4:2 F4 F4 E4 E4 D4 D4 C4:2 G4 G4 F4 F4 E4 E4 D4:2 G4 G4 F4 F4 E4 E4 D4:2 C4 C4 G4 G4 A4 A4 G4:2 F4 F4 E4 E4 D4 D4 C4:2'},
 {id:'frere',title:'Frère Jacques',author:'Tradicional; edição Mysid',license:'CC0-1.0',url:'https://commons.wikimedia.org/wiki/File:Fr%C3%A8re_Jacques.svg',score:'C4 D4 E4 C4 C4 D4 E4 C4 E4 F4 G4:2 E4 F4 G4:2 G4:0.5 A4:0.5 G4:0.5 F4:0.5 E4 C4 G4:0.5 A4:0.5 G4:0.5 F4:0.5 E4 C4 C4 G3 C4:2 C4 G3 C4:2'},
 {id:'ode',title:'Ode à Alegria',author:'L. van Beethoven; edição Peter Chubb / Mutopia-2009/08/05-528',license:'Public domain',url:'https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=528',score:'E4 E4 F4 G4 G4 F4 E4 D4 C4 C4 D4 E4 E4:1.5 D4:0.5 D4:2 E4 E4 F4 G4 G4 F4 E4 D4 C4 C4 D4 E4 D4:1.5 C4:0.5 C4:2 D4 D4 E4 C4 D4 E4:0.5 F4:0.5 E4 C4 D4 E4:0.5 F4:0.5 E4 D4 C4 D4 G3:2 E4 E4 F4 G4 G4 F4 E4 D4 C4 C4 D4 E4 D4:1.5 C4:0.5 C4:2'}
];
const semitones={C:0,D:2,E:4,F:5,G:7,A:9,B:11};
const manifest={version:1,rate,channels:2,encoding:'PCM16LE',renderLicense:'CC0-1.0',melodies,files:[]};
fs.mkdirSync(path.join(root,'assets/music'),{recursive:true});
for(const melody of melodies)for(const bpm of [60,90,120]){
 const notes=melody.score.split(' ').map(s=>{const m=/^([A-G])(\d)(?::([\d.]+))?$/.exec(s);return {midi:(Number(m[2])+1)*12+semitones[m[1]],beats:Number(m[3]||1)};});
 const beats=notes.reduce((n,x)=>n+x.beats,0);if(beats%2)throw Error('Loop must end on a 2/4 bar');
 const frames=Math.round(beats*60*rate/bpm),bytes=Buffer.alloc(44+frames*4);
 bytes.write('RIFF');bytes.writeUInt32LE(bytes.length-8,4);bytes.write('WAVEfmt ',8);bytes.writeUInt32LE(16,16);bytes.writeUInt16LE(1,20);bytes.writeUInt16LE(2,22);bytes.writeUInt32LE(rate,24);bytes.writeUInt32LE(rate*4,28);bytes.writeUInt16LE(4,32);bytes.writeUInt16LE(16,34);bytes.write('data',36);bytes.writeUInt32LE(frames*4,40);
 let beat=0;
 for(const note of notes){
  const start=Math.round(beat*60*rate/bpm);beat+=note.beats;const end=Math.round(beat*60*rate/bpm),duration=(end-start)/rate,hz=440*2**((note.midi-69)/12);
  for(let i=start;i<end;i++){
   const t=(i-start)/rate,attack=Math.min(1,t/.012),release=Math.min(1,(duration-t)/.04);
   const fundamental=Math.sin(2*Math.PI*hz*t),overtone=.18*Math.sin(4*Math.PI*hz*t);
   const value=(fundamental+overtone)*Math.exp(-t*1.4)*attack*release*.44;
   const sample=Math.round(Math.max(-1,Math.min(1,value))*32767);
   bytes.writeInt16LE(sample,44+i*4);bytes.writeInt16LE(sample,46+i*4);
  }
 }
 const name=`music/${melody.id}-${bpm}.wav`;fs.writeFileSync(path.join(root,'assets',name),bytes);
 manifest.files.push({file:name,bpm,beats,frames,bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')});
}
fs.writeFileSync(path.join(root,'assets/music-manifest.json'),JSON.stringify(manifest,null,2)+'\n');
console.log('9 WAVs PCM estéreo 48 kHz gerados e verificados.');
