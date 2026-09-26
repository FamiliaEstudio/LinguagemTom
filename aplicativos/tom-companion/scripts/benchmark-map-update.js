'use strict';
// End-to-end edit -> debounce -> worker -> ACK -> atomic Tom publication.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {GraphSession}=require('../../../tom-lang/companion/graph-session');
const root=path.resolve(__dirname,'../../..');
async function main(){
 const dir=path.join(__dirname,'../build/update-benchmark',process.platform);fs.mkdirSync(dir,{recursive:true});
 const file=path.join(dir,'main.tom'),base=Array.from({length:100},(_,f)=>`DefFuncaoxF${f}[]yVazio\n`+Array.from({length:98},(_,i)=>`DefVarInSd32xV${i}y1`).join('\n')+'\nFimFuncao').join('\n');
 fs.writeFileSync(file,base);let source=base,revision=1;
 const executable=path.join(root,'aplicativos/tom-companion/build',process.platform,'O2/companion/mapa/mapa'+(process.platform==='win32'?'.exe':''));
 const s=new GraphSession({root,executable,documents:()=>[{file,source,revision}],env:{SDL_VIDEODRIVER:'dummy',SDL_RENDER_DRIVER:'software'}});
 let phase=null,start=0;const phases=[],request=s.request.bind(s),analyzed=s.analyzed.bind(s);
 s.request=p=>{if(phase&&p.op==='analyze')phase.sourceReadyMs=performance.now()-start;return request(p);};
 s.analyzed=p=>{if(phase)phase.analysisReceivedMs=performance.now()-start;return analyzed(p);};
 s.on('sent',p=>{if(phase&&p.kind==='commit')phase.commitSentMs=performance.now()-start;});
 const failures=[];s.on('failure',e=>failures.push(e.message));
 const next=()=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>{s.off('published',handler);reject(Error('Publication timeout: '+failures.join('; ')));},20000);const handler=v=>{clearTimeout(timer);resolve(v);};s.once('published',handler);});
 try{
  const first=next();s.start(file);const initial=await first,ms=[];
  for(let i=0;i<5;i++){source='// não salvo '+i+'\n'+base;revision++;const published=next();start=performance.now();phase={};s.update(400);await published;ms.push(performance.now()-start);phases.push(phase);phase=null;}
  if(failures.length)throw Error(failures.join('; '));
  const result={date:new Date().toISOString(),platform:process.platform,release:os.release(),cpu:os.cpus()[0]?.model,node:process.version,instructions:10000,nodes:initial.nodes.length,edges:initial.edges.length,debounceMs:400,editToPublicationMs:ms,phases};
  fs.writeFileSync(path.join(dir,'result.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
 }finally{s.dispose();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
