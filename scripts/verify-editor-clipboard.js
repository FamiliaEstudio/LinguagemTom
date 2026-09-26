'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {spawn,spawnSync}=require('node:child_process');
const {root,platform,toolchain,linkArguments,copyAssets,command}=require('../tom-lang/core/native-build');
const directory=path.join(platform,'validation-editor/clipboard');
function powershell(source,input){const encoded=Buffer.from(source,'utf16le').toString('base64');return command('powershell.exe',['-NoLogo','-NoProfile','-EncodedCommand',encoded],{input}).stdout.trim();}
function clipboard() {
 if(process.platform==='win32')return {
  read:()=>Buffer.from(powershell("[Console]::Write([Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes([string](Get-Clipboard -Raw))))"),'base64').toString('utf8'),
  write:text=>text.length?powershell("Set-Clipboard -Value ([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String([Console]::In.ReadToEnd())))",Buffer.from(text).toString('base64')):powershell("Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Clipboard]::Clear()")
 };
 const local=path.join(platform,'clipboard-tools/root'),binary=process.env.TOM_XCLIP||(fs.existsSync(path.join(local,'usr/bin/xclip'))?path.join(local,'usr/bin/xclip'):'xclip');
 const env={...process.env,LD_LIBRARY_PATH:path.join(local,'usr/lib/x86_64-linux-gnu')};
 return {read:()=>command(binary,['-selection','clipboard','-out'],{env,timeout:10000}).stdout,write:text=>command(binary,['-selection','clipboard','-in'],{env,input:text,timeout:10000,stdio:['pipe','ignore','ignore']})};
}
async function main(){
 fs.mkdirSync(directory,{recursive:true});const binary=path.join(directory,process.platform==='win32'?'clipboard.exe':'clipboard');
 command(toolchain().clang,['-O2','-DTOM_EDITOR_TEST','-I',path.join(root,'tom-lang/runtime/stable'),path.join(root,'tom-lang/tests/fixtures/editor-runtime.c'),...linkArguments(['editor_ui']),'-o',binary]);copyAssets(directory,['editor_ui']);
 const env={...process.env,SDL_RENDER_DRIVER:'software'};delete env.TOM_UI_EVENTS;delete env.LD_LIBRARY_PATH;env.SDL_VIDEODRIVER=process.platform==='win32'?'windows':'x11';
 const external=clipboard();let original;try{original=external.read();}catch{}
 const text='Olá, café; é; 👩🏽‍💻; 🇧🇷\n'+('Ação e memória. '.repeat(80));const normalize=s=>s.replaceAll('\r\n','\n');let writer;
 try {
  const payload=path.join(directory,'clipboard.txt');fs.writeFileSync(payload,text);
  writer=spawn(binary,['clipboard-write-file',payload],{env,stdio:['ignore','pipe','pipe']});let stderr='';writer.stderr.on('data',b=>stderr+=b);
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Clipboard writer timeout '+stderr)),10000);writer.once('error',reject);writer.stdout.on('data',b=>{if(b.toString().includes('clipboard-ready')){clearTimeout(timer);resolve();}});});
  const another=command(binary,['clipboard-read'],{env,timeout:10000});assert.equal(normalize(another.stdout).trimEnd(),text.trimEnd());
  assert.equal(normalize(external.read()).trimEnd(),text.trimEnd());
  external.write(text+'Aplicativo externo.');
  const read=command(binary,['clipboard-read'],{env,timeout:10000});assert.equal(normalize(read.stdout).trimEnd(),(text+'Aplicativo externo.').trimEnd());
  fs.writeFileSync(path.join(directory,'results.json'),JSON.stringify({platform:process.platform,date:new Date().toISOString(),bytes:Buffer.byteLength(text),twoInstances:true,externalToTom:true,tomToExternal:true,external:process.platform==='win32'?'PowerShell':'xclip'},null,2)+'\n');
  console.log('Área de transferência: duas instâncias e aplicativo externo, Unicode e múltiplas linhas OK.');
 }finally{if(writer?.exitCode===null)writer.kill();if(original!==undefined)external.write(original);}
}
if(require.main===module)main().catch(e=>{console.error(e.stack);process.exitCode=1;});
