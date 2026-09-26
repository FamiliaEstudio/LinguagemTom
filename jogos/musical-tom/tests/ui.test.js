'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {spawnSync,spawn}=require('node:child_process');
const {execute}=require('../../../tom-lang/tests/helpers');
const {loadModules}=require('../../../tom-lang/core/module-loader');const {build,app}=require('../scripts/build');
const click=(x,y)=>`mouse ${x} ${y}\nrelease ${x} ${y}\n`;
for(const optimize of ['-O0','-O2'])test(`musical: janela, pausa, ajuda, configurações e perfil ${optimize}`,async()=>{
 const out=path.join(app,'build','tests',process.platform,optimize.slice(1));fs.mkdirSync(out,{recursive:true});
 const binary=build({optimize,testUI:true,leaks:true,output:out}),data=path.join(out,'data');fs.rmSync(data,{recursive:true,force:true});
 const events=path.join(out,'events.txt'),trace=path.join(out,'trace.txt');
 const env={...process.env,SDL_VIDEODRIVER:'dummy',SDL_AUDIODRIVER:'dummy',SDL_RENDER_DRIVER:'software',TOM_DATA_DIRECTORY:data,TOM_UI_EVENTS:events,TOM_UI_TRACE:trace};
 function launch(input){fs.writeFileSync(events,input);const r=spawnSync(binary,[],{env,encoding:'utf8',timeout:30000});assert.ifError(r.error);assert.equal(r.status,0,r.stdout+r.stderr);return fs.readFileSync(trace,'utf8');}
 const scriptFile=path.resolve(__dirname,'roteiro.tom');
 const source=`Importar[l'../src/conteudo.tom']
DefArraySoAxNotasxJogoNotax20
ChamarxJogoDistribuir[@Notas,Falso,0,43]
DefStkFB32CxTexto yl''
ParaIndiceSOAxI[@Notas]
InSd32ParaInSd64[Notas@@I.letra]
InSd64ParaTexto[@ULTIMO,@Texto]
GerarTxtxTexto
FimPara`.replace('xTexto y','xTextoy');
 const sequence=execute(source,{file:scriptFile,modules:loadModules(source,scriptFile),optimize});assert.equal(sequence.status,0,sequence.stdout);
 const keyCodes=[122,100,101,102,103,97,98];
 const answers=Array.from(sequence.stdout,n=>{const i=Number(n);return `down ${keyCodes[i]} ${i+4} 0\nup ${keyCodes[i]} ${i+4}\n`;}).join('');
 let content=launch(click(820,520)+click(420,500)+'down 122 29 0\nup 122 29\n'+click(245,380)+click(140,680)+'quit\n');
 assert.ok(content.includes('Musical Tom'));const profile=JSON.parse(fs.readFileSync(path.join(data,'perfil.json'),'utf8'));
 assert.equal(profile.formato,'MusicalTom');assert.equal(profile.versao,1);assert.equal(profile.teclas[0],122);assert.equal(profile.config.entradaNs,'5000000');
 // A preferência visual é salva e reaberta pelo mesmo fluxo real das configurações.
 launch(click(820,520)+click(850,500)+'quit\n');
 assert.equal(JSON.parse(fs.readFileSync(path.join(data,'perfil.json'),'utf8')).config.reduzirMovimento,true);
 launch(click(820,520)+click(850,500)+'quit\n');
 assert.equal(JSON.parse(fs.readFileSync(path.join(data,'perfil.json'),'utf8')).config.reduzirMovimento,false);
 content=launch(click(200,590)+'wait 50\n'+click(120,650)+'focuslost\nfocusgain\n'+click(120,650)+'down 1073741882 58 0\nup 1073741882 58\ndown 122 29 0\nup 122 29\n'+answers+'resize 1300 880\nquit\n');
 assert.ok(content.includes('APRENDER'),content.slice(-5000));assert.ok(!content.includes('Rodada interrompida'),content.slice(-5000));
 const completed=JSON.parse(fs.readFileSync(path.join(data,'perfil.json'),'utf8'));assert.equal(completed.ultima,'1');assert.equal(completed.pontos,'190');assert.equal(completed.Resultados[0].ajudas,'1');
 // Capture a short session; writing BMP on every event distorts timing on WSL/NTFS.
 env.TOM_UI_SNAPSHOT=path.join(out,'screen.bmp');launch(click(200,590)+'wait 30\nquit\n');delete env.TOM_UI_SNAPSHOT;
 assert.ok(fs.statSync(path.join(out,'screen.bmp')).size>100000);
 content=launch(click(480,520)+'quit\n');assert.ok(content.includes('Rodada 1'));assert.ok(content.includes('Sol / Aprender / 60 BPM'));
 // Both moving modes also execute with bass clef, accidentals and the faster WAV.
 const unlocked=structuredClone(completed);unlocked.pontos='10000';unlocked.config.clave='Fa';unlocked.config.bpm='120';unlocked.config.acidentes=true;
 for(const row of unlocked.Dominios){row.qualificadas='2';row.rodadas='2';}
 for(const mode of ['Movimento','Ritmo']){
  unlocked.config.modo=mode;fs.writeFileSync(path.join(data,'perfil.json'),JSON.stringify(unlocked));
  env.TOM_UI_SNAPSHOT=path.join(out,mode+'.bmp');content=launch(click(180,590)+'wait 50\nresize 1300 880\nquit\n');delete env.TOM_UI_SNAPSHOT;
  assert.ok(content.includes(mode.toUpperCase()),content.slice(-2000));assert.ok(!content.includes('Rodada interrompida'),content.slice(-2000));
 }
 // Simulate a replacement failure *after* startup has read a valid profile.
 fs.writeFileSync(path.join(data,'perfil.json'),JSON.stringify(completed));fs.rmSync(trace,{force:true});
 fs.writeFileSync(events,'wait 1500\n'+click(820,520)+click(245,380)+'wait 1500\n'+click(420,680)+'quit\n');
 const child=spawn(binary,[],{env,stdio:['ignore','pipe','pipe']});let errors='';child.stderr.on('data',b=>errors+=b);child.stdout.on('data',b=>errors+=b);
 const ended=new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',(status,signal)=>resolve({status,signal}));});
 async function waitFor(value){const until=Date.now()+15000;while(Date.now()<until){
  try{if(fs.readFileSync(trace,'utf8').includes(value))return;}catch(error){
   // WSL/NTFS can report transient ENODATA while the native process appends.
   if(!['ENOENT','ENODATA'].includes(error.code))throw error;
  }
  await new Promise(r=>setTimeout(r,20));
 }throw Error('Missing trace: '+value+' '+errors);}
 try{
  await waitFor('FRAME');fs.unlinkSync(path.join(data,'perfil.json'));fs.mkdirSync(path.join(data,'perfil.json'));
  await waitFor('Não foi possível salvar');fs.rmdirSync(path.join(data,'perfil.json'));
  const result=await ended;assert.equal(result.status,0,errors);assert.equal(result.signal,null);
  const saved=JSON.parse(fs.readFileSync(path.join(data,'perfil.json'),'utf8'));assert.equal(saved.pontos,'190');assert.equal(saved.ultima,'1');assert.equal(saved.config.entradaNs,'10000000');
 }finally{if(child.exitCode===null)child.kill();}
 // Unsupported profile versions preserve the exact original bytes.
 const invalid='{"formato":"MusicalTom","versao":99}';fs.writeFileSync(path.join(data,'perfil.json'),invalid);
 content=launch(click(170,700)+'quit\n');assert.ok(content.includes('Perfil inválido'));assert.equal(fs.readFileSync(path.join(data,'perfil.json'),'utf8'),invalid);
});
