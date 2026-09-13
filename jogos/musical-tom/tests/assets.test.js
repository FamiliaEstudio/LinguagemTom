'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
test('musical: nove fundos com hashes, duração exata, volumes limitados e ciclos completos',()=>{
 const assets=path.resolve(__dirname,'../assets'),manifest=JSON.parse(fs.readFileSync(path.join(assets,'music-manifest.json'),'utf8'));assert.equal(manifest.files.length,9);
 for(const item of manifest.files){
  const data=fs.readFileSync(path.join(assets,item.file));assert.equal(crypto.createHash('sha256').update(data).digest('hex'),item.sha256);
  assert.equal(data.toString('ascii',0,4),'RIFF');assert.equal(data.readUInt32LE(24),48000);assert.equal(data.readUInt16LE(22),2);assert.equal(data.readUInt16LE(34),16);assert.equal(data.length,44+item.frames*4);assert.equal(item.frames*item.bpm,item.beats*60*48000);assert.equal(item.beats%2,0);
  let peak=0,energy=0;for(let i=44;i<data.length;i+=4){const value=data.readInt16LE(i);peak=Math.max(peak,Math.abs(value));energy+=value*value;assert.equal(value,data.readInt16LE(i+2));}
  assert.ok(peak>5000&&peak<25000);assert.ok(energy/item.frames>1000000);assert.ok(Math.abs(data.readInt16LE(44))<10);assert.ok(Math.abs(data.readInt16LE(data.length-4))<100);
 }
 assert.ok(fs.readFileSync(path.join(assets,'licenses/CC0-1.0.txt'),'utf8').includes('CC0 1.0 Universal'));
});
