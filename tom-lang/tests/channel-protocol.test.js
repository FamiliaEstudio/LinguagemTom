'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawn}=require('node:child_process'),{command}=require('./helpers'),{linkArguments,copyAssets}=require('../core/native-build');
for(const optimize of ['-O0','-O2'])test(`native channel fragmentation, atomic receive, queues, disconnect and blocked writer cleanup ${optimize}`,{timeout:30000},async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'tom-channel-')),binary=path.join(dir,process.platform==='win32'?'channel.exe':'channel');
  try{
    command(process.env.CLANG||'clang',[optimize,'-I'+path.join(__dirname,'../runtime/stable'),'-I'+path.join(process.env.TOM_NATIVE_ROOT||path.resolve(__dirname,'../../.tools',process.platform==='win32'?'windows':'linux','native'),'include'),path.join(__dirname,'fixtures/channel-protocol.c'),'-o',binary,...linkArguments(['channel'],process.env.CLANG||'clang')]);copyAssets(dir,['channel']);
    for(const mode of ['fragmented','overflow','blocked','wait']){
      const child=spawn(binary,[mode],{stdio:['pipe','pipe','pipe']});let stdout='',stderr='';if(mode!=='blocked')child.stdout.on('data',s=>stdout+=s);child.stderr.on('data',s=>stderr+=s);
      const exit=new Promise((resolve,reject)=>{const timer=setTimeout(()=>{child.kill();reject(Error('Channel cleanup timeout'));},6000);child.on('error',reject);child.on('exit',code=>{clearTimeout(timer);resolve(code);});});exit.catch(()=>{});
      if(mode==='wait'){await new Promise(resolve=>{const check=()=>{if(stdout.includes('waiting')){child.stdout.off('data',check);resolve();}};child.stdout.on('data',check);check();});child.stdin.end('Olá 🐈 %\n');}
      else if(mode==='fragmented'){for(const byte of Buffer.from('Olá 🐈 %\n')){child.stdin.write(Buffer.from([byte]));await new Promise(r=>setTimeout(r,2));}child.stdin.end();}
      else if(mode==='overflow')child.stdin.end('first\nsecond\nthird\n');
      assert.equal(await exit,0,mode+': '+stderr);if(mode==='fragmented')assert.equal(stdout,'Olá 🐈 %\n');child.stdout.destroy();child.stdin.destroy();
    }
  }finally{fs.rmSync(dir,{recursive:true,force:true,maxRetries:10,retryDelay:100});}
});
