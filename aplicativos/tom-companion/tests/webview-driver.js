'use strict';
// CDP is enabled only by the isolated desktop validation launcher, never by the extension.
const fs=require('node:fs');
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function connect(port){
  const version=await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
  const socket=new WebSocket(version.webSocketDebuggerUrl),pending=new Map(),contexts=new Map(),attached=new Map();let next=0;
  await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});
  socket.addEventListener('message',event=>{
    const p=JSON.parse(event.data);
    if(p.id){const entry=pending.get(p.id);if(!entry)return;pending.delete(p.id);clearTimeout(entry.timer);p.error?entry.reject(Error(JSON.stringify(p.error))):entry.resolve(p.result);}
    if(p.method==='Runtime.executionContextCreated'){const c=p.params.context;contexts.set(p.sessionId+':'+c.id,{session:p.sessionId,id:c.id});}
    if(p.method==='Runtime.executionContextDestroyed')contexts.delete(p.sessionId+':'+p.params.executionContextId);
    if(p.method==='Runtime.executionContextsCleared')for(const [key,c] of contexts)if(c.session===p.sessionId)contexts.delete(key);
  });
  const send=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const id=++next,timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout: '+method));},8000);pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}));});
  async function discover(){
    const {targetInfos}=await send('Target.getTargets');
    for(const target of targetInfos){if(!['page','iframe','webview'].includes(target.type)||attached.has(target.targetId))continue;
      const {sessionId}=await send('Target.attachToTarget',{targetId:target.targetId,flatten:true});attached.set(target.targetId,{sessionId,target});await send('Runtime.enable',{},sessionId);
    }
  }
  async function evaluateContext(context,expression){const result=await send('Runtime.evaluate',{expression,contextId:context.id,returnByValue:true,awaitPromise:true},context.session);if(result.exceptionDetails)throw Error(result.exceptionDetails.text+': '+result.exceptionDetails.exception?.description);return result.result.value;}
  async function view(kind){
    const deadline=Date.now()+15000;
    do{await discover();for(const c of [...contexts.values()])try{if(await evaluateContext(c,`typeof document!=='undefined'&&document.body?.dataset.view===${JSON.stringify(kind)}&&document.visibilityState==='visible'`))return c;}catch{}await pause(100);}while(Date.now()<deadline);
    throw Error('Webview não localizada: '+kind+'; targets='+JSON.stringify([...attached.values()].map(v=>v.target.url)));
  }
  return {
    async evaluate(kind,expression){return evaluateContext(await view(kind),expression);},
    async wait(kind,expression){const deadline=Date.now()+15000;do{const value=await this.evaluate(kind,expression);if(value)return value;await pause(80);}while(Date.now()<deadline);throw Error('Condição visual não satisfeita: '+expression);},
    async screenshot(file){await discover();const item=[...attached.values()].find(v=>v.target.type==='page'&&v.target.url.includes('workbench'));if(!item)throw Error('Workbench não localizado');const result=await send('Page.captureScreenshot',{format:'png'},item.sessionId);fs.writeFileSync(file,Buffer.from(result.data,'base64'));},
    close(){for(const entry of pending.values()){clearTimeout(entry.timer);entry.reject(Error('CDP encerrado'));}pending.clear();socket.close();}
  };
}
module.exports={connect};
