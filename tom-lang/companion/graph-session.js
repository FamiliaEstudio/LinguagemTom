'use strict';
const {EventEmitter}=require('node:events'),{spawn}=require('node:child_process');
const path=require('node:path'),{randomUUID}=require('node:crypto');
const {blocks}=require('./graph-model');
const {Presentation}=require('./presentation');
const {collectProject}=require('./project-sources');
class JsonLines {
  constructor(accept,limit=1048576){this.accept=accept;this.limit=limit;this.parts=[];this.length=0;}
  push(chunk){let start=0;for(let i=0;i<chunk.length;i++)if(chunk[i]===10){this.append(chunk.subarray(start,i));const bytes=Buffer.concat(this.parts,this.length);this.parts=[];this.length=0;this.accept(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)));start=i+1;}this.append(chunk.subarray(start));}
  append(part){if(!part.length)return;if(this.length+part.length>this.limit)throw Error('Mensagem excede a capacidade negociada.');this.parts.push(part);this.length+=part.length;}
  end(){if(this.length)throw Error('Mensagem fragmentada ao desconectar.');}
}
class GraphSession extends EventEmitter {
  constructor({root,executable,mapExecutable,node=process.execPath,env={},nativeEnv,headless=false,onNavigate=()=>{},onDiagnostics=()=>{},documents=()=>[]}={}){
    super();Object.assign(this,{root,executable:mapExecutable||executable,node,env:{...process.env,...env},nativeEnv,onNavigate,onDiagnostics,documents});
    this.session=randomUUID();this.revision=0;this.serial=0;this.disposed=false;this.ready=false;this.model=null;this.pending=null;this.edits=[];this.projectFiles=new Set();this.headless=headless;this.presentation=new Presentation(this);
  }
  start(file){
    this.file=path.resolve(file);this.projectFiles.add(this.file.replace(/\\/g,'/'));
    this.worker=spawn(this.node,[path.join(this.root,'tom-lang/companion/project-worker.js')],{env:this.env,stdio:['pipe','pipe','pipe'],windowsHide:true});
    const analysis=new JsonLines(packet=>this.analyzed(packet),8*1024*1024);
    this.worker.stdout.on('data',chunk=>{try{analysis.push(chunk);}catch(e){this.failure(e);}});
    this.worker.on('error',e=>this.failure(e));this.worker.stdin.on('error',e=>this.failure(e));this.worker.stderr.on('data',c=>this.emit('log',c.toString()));
    this.worker.on('exit',()=>{if(!this.disposed)this.failure(Error('O analisador foi encerrado. Reabra o mapa para sincronizar.'));});
    this.child=spawn(this.executable,[],{env:this.nativeEnv||this.env,stdio:['pipe','pipe','pipe'],windowsHide:true});
    const native=new JsonLines(packet=>this.receive(packet));
    this.child.stdout.on('data',chunk=>{try{native.push(chunk);}catch(e){this.failure(e);}});
    this.child.stderr.on('data',c=>this.emit('log',c.toString()));this.child.on('error',e=>this.failure(e));this.child.stdin.on('error',e=>{if(!this.disposed)this.failure(e);});
    this.child.on('exit',(code)=>{try{native.end();}catch(e){this.failure(e);}this.dispose();this.emit('exit',code);});
    this.update(0);return this.child;
  }
  send(packet){if(this.disposed||!this.child||this.child.stdin.destroyed)return;
    const text=JSON.stringify({v:1,session:this.session,revision:this.revision,...packet})+'\n';
    if(Buffer.byteLength(text)>1048576||this.child.stdin.writableLength>1048576*7)throw Error('Fila de transporte do mapa cheia.');this.child.stdin.write(text);this.emit('sent',packet);
  }
  failure(error){if(this.disposed)return;clearTimeout(this.ackTimer);this.pending=null;this.emit('failure',error);if(this.ready&&!this.child.stdin.destroyed)try{this.send({kind:'stale',message:error.message});}catch{} }
  update(delay=400,edit=null){
    if(edit){this.edits.push(edit);if(this.edits.length>256)this.edits=[];}
    this.revision++;clearTimeout(this.debounce);clearTimeout(this.ackTimer);this.pending=null;this.latest=null;
    if(this.ready)this.send({kind:'stale',message:'Código mudou; aguardando análise da revisão atual.'});
    const revision=this.revision;
    this.debounce=setTimeout(async()=>{try{const input=await collectProject(this.file,this.documents(),this.root);if(revision!==this.revision||this.disposed)return;this.projectFiles=new Set(Object.keys(input.sources));input.revision=revision;input.edits=this.edits;this.request({op:'analyze',input});}catch(e){this.failure(e);}},delay);
  }
  request(packet){if(this.worker.stdin.destroyed)throw Error('Analisador desconectado.');this.worker.stdin.write(JSON.stringify({id:++this.serial,revision:this.revision,...packet})+'\n');}
  analyzed(packet){if(this.disposed||packet.revision!==this.revision)return;if(packet.error){this.failure(Error(packet.error));return;}
    this.latest=packet.result;this.edits=[];this.onDiagnostics(packet.result.diagnostics);if(this.ready)this.publish(packet.result);
  }
  publish(view){
    clearTimeout(this.ackTimer);const transfer=++this.serial;
    this.pending={transfer,revision:this.revision,view,blocks:blocks(view),index:-1};
    this.send({kind:'begin',transfer,count:this.pending.blocks.length,nodes:view.nodes.length,edges:view.edges.length,notice:view.success?'Revisão atual analisada. Valores exibidos são iniciais, não valores de execução.':`${view.diagnostics.length} diagnóstico(s). Trechos incompletos ou não resolvidos estão sinalizados.`});this.arm();
  }
  arm(){clearTimeout(this.ackTimer);this.ackTimer=setTimeout(()=>this.failure(Error('Tempo de confirmação esgotado; pressione R para sincronizar novamente.')),5000);}
  receive(packet){
    this.emit('received',packet);
    if(this.presentation.receive(packet))return;
    if(packet.v!==1)throw Error('Protocolo incompatível.');
    if(packet.kind==='ready'){
      if(this.ready)return;
      if(this.headless&&!packet.capabilities?.includes('graph-view-v1'))throw Error('Atualize o pacote para usar o mapa integrado.');
      if(!packet.capabilities?.includes('graph-v1')||!packet.capabilities.includes('ack-chunks'))throw Error('Este pacote não oferece o mapa de código. Reconstrua o Companion.');
      this.ready=true;this.send({kind:'hello',capabilities:['graph-v1','ack-chunks'],limit:1048576,capacity:8});this.presentation.ready();this.emit('ready');if(this.latest)this.publish(this.latest);return;
    }
    if(packet.session!==this.session)return;
    if(packet.kind==='resync'){if(this.latest)this.publish(this.latest);else this.update(0);return;}
    if(packet.kind==='ack'){
      const p=this.pending;if(!p||packet.revision!==p.revision||packet.transfer!==p.transfer||packet.index!==p.index)return;
      clearTimeout(this.ackTimer);p.index++;
      if(p.index<p.blocks.length){this.send({kind:'block',transfer:p.transfer,index:p.index,data:p.blocks[p.index]});this.arm();}
      else if(p.index===p.blocks.length){this.send({kind:'commit',transfer:p.transfer,index:p.index});this.arm();}
      else{this.model=p.view;this.pending=null;this.emit('published',p.view);}
      return;
    }
    if(packet.kind==='failure'){this.failure(Error(packet.message||'O mapa recusou a atualização.'));return;}
    if(packet.revision!==this.revision)return;
    if(packet.kind==='filter'){const filter=packet.filter??packet.index;if(Number.isInteger(filter)&&filter>=0&&filter<=8)this.request({op:'filter',filter});return;}
    if(!this.model||this.model.revision!==this.revision)return;
    const target=this.model.locations[packet.node];if(!target)return;
    if(packet.kind==='navigate')Promise.resolve(this.onNavigate(target)).catch(e=>this.failure(e));
    else if(packet.kind==='expand')this.request({op:'expand',target:target.id});
  }
  select(file,line){if(!this.model||this.model.revision!==this.revision)return;const match=Object.entries(this.model.locations).filter(([,n])=>n.file.replace(/\\/g,'/')===file.replace(/\\/g,'/')&&n.line<=line).sort((a,b)=>b[1].line-a[1].line)[0];if(match)this.send({kind:'select',node:Number(match[0])});}
  dispose(){if(this.disposed)return;this.presentation.dispose();this.ready=false;this.disposed=true;clearTimeout(this.debounce);clearTimeout(this.ackTimer);this.pending=null;this.latest=null;this.worker?.kill();this.child?.kill();}
}
module.exports={GraphSession,JsonLines};
