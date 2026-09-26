'use strict';
const fs=require('node:fs'),fsp=fs.promises,path=require('node:path');
const {EventEmitter}=require('node:events'),{spawn,spawnSync}=require('node:child_process');
const {randomUUID,createHash}=require('node:crypto');
const {TextDecoder}=require('node:util');
const {courseAt}=require('./verify');
const {Presentation}=require('./presentation');
const MAX_MESSAGE=1048576,MAX_SOURCE=131072;
function clipText(value,limit=8192){
  const text=value.replace(/\0/g,'\\0');if(Buffer.byteLength(text)<=limit)return text;
  let end=limit-64;while(end>0&&Buffer.byteLength(text.slice(0,end))>limit-64)end=Math.floor(end*0.8);
  if(/[\uD800-\uDBFF]/.test(text[end-1]||''))end--;
  return text.slice(0,end)+' … (abreviado no cartão; consulte o editor)';
}
class Lines {
  constructor(accept){this.bytes=Buffer.alloc(0);this.accept=accept;}
  push(chunk){
    let start=0;
    for(let i=0;i<chunk.length;i++)if(chunk[i]===10){this.append(chunk.subarray(start,i));const text=new TextDecoder('utf-8',{fatal:true}).decode(this.bytes);this.bytes=Buffer.alloc(0);this.accept(JSON.parse(text));start=i+1;}
    this.append(chunk.subarray(start));
  }
  append(bytes){if(this.bytes.length+bytes.length>MAX_MESSAGE)throw Error('Mensagem excede 1 MiB.');this.bytes=Buffer.concat([this.bytes,bytes]);}
  end(){if(this.bytes.length)throw Error('Mensagem incompleta ao encerrar a conexão.');}
}
function defaults(course){return {version:1,course:course.id,courseVersion:course.version,referenceHash:course.reference.sha256,step:0,font:0,hints:course.steps.map(()=>0),verified:{},completed:false};}
function validateProgress(p,course){
  if(!p||p.version!==1||p.course!==course.id||p.courseVersion!==course.version||p.referenceHash!==course.reference.sha256)throw Error('O progresso pertence a outra versão do roteiro.');
  if(!Number.isSafeInteger(p.step)||p.step<0||p.step>=course.steps.length||!Number.isInteger(p.font)||p.font<0||p.font>2||typeof p.completed!=='boolean')throw Error('Estado de progresso inválido.');
  if(!Array.isArray(p.hints)||p.hints.length!==course.steps.length||p.hints.some(n=>!Number.isInteger(n)||n<0||n>3))throw Error('Histórico de dicas inválido.');
  if(!p.verified||Array.isArray(p.verified)||typeof p.verified!=='object'||Object.entries(p.verified).some(([k,v])=>!/^\d+$/.test(k)||+k>=course.steps.length||typeof v!=='string'||!/^[a-f0-9]{64}$/.test(v)))throw Error('Histórico de verificações inválido.');
  return p;
}
async function atomicProgress(file,value){
  await fsp.mkdir(path.dirname(file),{recursive:true});const temporary=file+'.'+randomUUID()+'.tmp';
  let handle;
  try{handle=await fsp.open(temporary,'wx',0o600);await handle.writeFile(JSON.stringify(value,null,2)+'\n','utf8');await handle.sync();await handle.close();handle=null;await fsp.rename(temporary,file);}
  finally{if(handle)await handle.close();await fsp.rm(temporary,{force:true});}
}
function terminate(child){
  if(!child||child.exitCode!==null||child.signalCode!==null)return;
  if(process.platform==='win32')spawnSync('taskkill',['/PID',String(child.pid),'/T','/F'],{stdio:'ignore',windowsHide:true,timeout:5000});
  else {try{process.kill(-child.pid,'SIGKILL');}catch{child.kill('SIGKILL');}}
}
function selectionContext(a,line){
  const instruction=a.instructions.find(n=>n.location.line===line)||{kind:'incomplete',text:'',location:{file:a.instructions[0]?.location.file||'',line,column:1}};
  const relations=[],seen=new Set(),add=(label,location)=>{if(!location)return;const key=label+JSON.stringify(location);if(!seen.has(key)){seen.add(key);relations.push({label,...location});}};
  const symbolMap=new Map(a.symbols.map(s=>[s.id,s]));
  for(const r of a.references.filter(r=>r.instruction===instruction.id))add('Declaração de '+r.name,symbolMap.get(r.target)?.location);
  const definitions=a.symbols.filter(s=>s.location.line===line&&s.location.file===instruction.location.file);
  for(const def of definitions)for(const r of a.references.filter(r=>r.target===def.id))add('Uso de '+def.name+' — linha '+r.location.line,r.location);
  for(const call of a.calls.filter(c=>c.instruction===instruction.id))add('Função '+call.name,a.instructions.find(n=>n.id===call.target)?.location);
  const owner=instruction.owner|| (instruction.kind==='function'?instruction.name:null);
  if(owner){for(const call of a.calls.filter(c=>c.name===owner))add('Quem chama '+owner+' — linha '+call.location.line,call.location);for(const call of a.calls.filter(c=>c.from===owner))add(owner+' chama '+call.name,a.instructions.find(n=>n.id===call.target)?.location);}
  if(instruction.opens)add('Abertura deste bloco',a.instructions.find(n=>n.id===instruction.opens)?.location);
  const last=a.lastResults.filter(r=>r.instruction===instruction.id).map(r=>{const producer=a.instructions.find(n=>n.id===r.producer);if(producer)add('Produtor de @ULTIMO — linha '+producer.location.line,producer.location);return {...r,producerLine:producer?.location.line||0};});
  const diagnostic=a.diagnostics[0];if(diagnostic)add('Diagnóstico — linha '+diagnostic.line,diagnostic);
  const called=a.instructions.find(n=>n.id===a.calls.find(c=>c.instruction===instruction.id)?.target);
  const parameters=called?.params||instruction.params||instruction.parameters?.map(type=>({type}));
  const shown={...instruction};let abbreviated=false;
  for(const key of ['text','command','name','owner','type','result','literal','operand','left','right','condition'])if(typeof shown[key]==='string'){
    const original=shown[key];shown[key]=clipText(original,['name','owner','command','type','result'].includes(key)?127:8192);abbreviated||=original!==shown[key];
  }
  if(shown.args){abbreviated||=shown.args.length>16;shown.args=shown.args.slice(0,16).map(arg=>{const clipped=clipText(arg,1024);abbreviated||=clipped!==arg;return clipped;});}
  if(abbreviated)shown.notice='O trecho é grande; o cartão mostra uma versão abreviada. O editor e a verificação mantêm o fonte completo.';
  return {instruction:shown,parameters:(parameters||[]).slice(0,16).map(p=>({...p,...(p.name?{name:clipText(p.name,127)}:{}),type:clipText(p.type,127)})),relations:relations.slice(0,256).map(r=>({...r,label:clipText(r.label,255)})),last,...(diagnostic?{diagnostic:{...diagnostic,message:clipText(diagnostic.message)}}:{}),compileSuccess:a.success};
}
class Session extends EventEmitter {
  constructor({root,executable,file,node=process.execPath,env={},nativeEnv,headless=false,onNavigate=()=>{},onCopy=async()=>{throw Error('A cópia requer a conexão com o VS Code.');},onDiagnostics=()=>{},persist=atomicProgress}){
    super();Object.assign(this,{root,executable,file,node,onNavigate,onCopy,onDiagnostics,persist,nativeEnv});this.env={...process.env,...env};
    this.course=courseAt(root);this.id=randomUUID();this.revision=1;this.selection=1;this.line=1;this.source='';this.hash=createHash('sha256').update('').digest('hex');
    this.jobs=new Map();this.progressFile=path.join(path.dirname(file),'.tom-companion/progresso.json');this.ready=false;this.disposed=false;this.saveChain=Promise.resolve();this.headless=headless;this.presentation=new Presentation(this);
  }
  async start(){
    let progress=defaults(this.course),notice='';
    try{const text=await fsp.readFile(this.progressFile);if(text.length>MAX_MESSAGE)throw Error('Progresso excede 1 MiB.');progress=validateProgress(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(text)),this.course);}
    catch(error){if(error.code!=='ENOENT'){this.invalidProgress=true;notice='Não foi possível restaurar o progresso: '+error.message+' O arquivo será preservado antes de um novo salvamento.';}}
    const child=this.child=spawn(this.executable,[],{stdio:['pipe','pipe','pipe'],env:this.nativeEnv||this.env,windowsHide:true,detached:process.platform!=='win32'});
    const messages=new Lines(message=>{
      if(message.v!==1)throw Error('Versão do protocolo incompatível.');
      if(message.kind==='ready'&&!this.ready){if(this.headless&&!message.capabilities?.includes('companion-view-v1'))throw Error('Atualize o pacote para usar o Companion integrado.');this.ready=true;this.send({kind:'init',course:this.course,progress,notice});this.presentation.ready();this.emit('ready');this.scheduleAnalysis(0);return;}
      if(this.presentation.receive(message))return;
      if(message.session!==this.id||!Number.isSafeInteger(message.request)||message.request<=0)throw Error('Mensagem de outra sessão ou solicitação inválida.');
      if(!Number.isSafeInteger(message.step)||message.step<0||message.step>=this.course.steps.length)throw Error('Passo inválido.');
      this.handle(message).catch(error=>this.status(message,error.message));
    });
    child.stdout.on('data',chunk=>{try{messages.push(chunk);}catch(error){this.emit('failure',error);this.dispose();}});
    let startupErrors='';child.stderr.on('data',chunk=>{const text=chunk.toString().slice(0,8192);if(startupErrors.length<8192)startupErrors+=text;this.emit('log',text);});
    child.on('error',error=>this.emit('failure',error));
    child.on('exit',(code,signal)=>{this.presentation.dispose();this.ready=false;this.cancelJobs();terminate(this.application);try{messages.end();}catch(error){this.emit('failure',error);}if(!this.disposed&&code!==0)this.emit('failure',Error(`O Companion terminou (${signal||code}). ${startupErrors}`));this.emit('exit',{code,signal});});
    child.stdin.on('error',error=>{if(!this.disposed)this.emit('failure',error);});
    return child;
  }
  send(value){
    if(!this.ready||this.disposed||this.child.stdin.destroyed)return false;
    const packet={v:1,session:this.id,revision:this.revision,selection:this.selection,...value};const text=JSON.stringify(packet)+'\n';
    if(Buffer.byteLength(text)>MAX_MESSAGE)throw Error('Mensagem excede 1 MiB.');
    if(this.child.stdin.writableLength>MAX_MESSAGE*8)throw Error('Fila de mensagens cheia.');
    this.child.stdin.write(text);this.emit('sent',packet);return true;
  }
  update(source,line=this.line){
    if(Buffer.byteLength(source)>MAX_SOURCE){
      clearTimeout(this.debounce);this.cancelJobs();this.source=source;this.revision++;this.selection++;this.line=Math.max(1,line);this.cache=null;
      this.hash=createHash('sha256').update(source).digest('hex');
      const diagnostic={file:this.file,line:1,column:1,severity:'error',code:'E_COMPANION_LIMIT',message:'O MVP aceita arquivos de até 128 KiB.'};
      this.onDiagnostics([diagnostic]);this.send({kind:'analysis',hash:this.hash,relations:[],last:[],compileSuccess:false,diagnostic});throw Error(diagnostic.message);
    }
    const changed=source!==this.source;this.source=source;this.line=Math.max(1,line);this.selection++;
    if(changed){this.revision++;this.hash=createHash('sha256').update(source).digest('hex');this.cache=null;this.cancel('verify');
      this.send({kind:'analysis',hash:this.hash,relations:[],last:[],compileSuccess:false});}
    if(this.ready)this.scheduleAnalysis(changed?400:50);
  }
  scheduleAnalysis(delay){clearTimeout(this.debounce);this.debounce=setTimeout(()=>this.analyze().catch(error=>this.status({},error.message)),delay);}
  async analyze(){
    if(!this.ready||this.disposed)return;
    const revision=this.revision,hash=this.hash;
    const result=this.cache?.hash===hash?this.cache:await this.job('analyze',{},20000);
    if(!result||revision!==this.revision)return;
    this.cache=result;this.context=selectionContext(result.result,this.line);
    this.onDiagnostics(result.result.diagnostics);this.send({kind:'analysis',hash,...this.context});
  }
  job(op,extra={},timeout=120000){
    if(Buffer.byteLength(this.source)>MAX_SOURCE)return Promise.reject(Error('O MVP aceita arquivos de até 128 KiB. Reduza o arquivo para verificar esta revisão.'));
    this.cancel(op);const temporaryDirectory=fs.mkdtempSync(path.join(require('node:os').tmpdir(),'tom-companion-job-'));
    const request={op,root:this.root,file:this.file,source:this.source,revision:this.revision,temporaryDirectory,...extra};
    const child=spawn(this.node,[path.join(this.root,'tom-lang/companion/worker.js')],{stdio:['pipe','pipe','pipe'],env:this.env,windowsHide:true,detached:process.platform!=='win32'});
    let output='',errors='',cancelled=false;
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{cancelled=true;terminate(child);reject(Error('A ferramenta excedeu o prazo de execução.'));},timeout);
      this.jobs.set(op,{child,cancel:()=>{cancelled=true;clearTimeout(timer);terminate(child);resolve(null);}});
      child.stdout.setEncoding('utf8');child.stdout.on('data',s=>{output+=s;if(Buffer.byteLength(output)>4*MAX_MESSAGE){terminate(child);reject(Error('Resposta da ferramenta excede o limite.'));}});
      child.stderr.on('data',s=>{if(errors.length<8192)errors+=s.toString();});
      const clean=()=>{try{fs.rmSync(temporaryDirectory,{recursive:true,force:true,maxRetries:10,retryDelay:100});}catch(error){this.emit('log','Não foi possível remover temporários: '+error.message);}if(this.jobs.get(op)?.child===child)this.jobs.delete(op);};
      child.on('error',error=>{clearTimeout(timer);clean();reject(error);});
      child.on('exit',code=>{clearTimeout(timer);clean();if(cancelled)return;try{const response=JSON.parse(output);if(response.error||code!==0)throw Error(response.error||errors||'A ferramenta falhou.');resolve(response);}catch(error){reject(error);}});
      child.stdin.on('error',()=>{});child.stdin.end(JSON.stringify(request));
    });
  }
  status(message,text){if(message.revision!==undefined&&message.revision!==this.revision)return;this.send({kind:'status',request:message.request||0,message:clipText(text)});}
  async handle(message){
    this.emit('received',message);
    if(message.kind==='save'){
      this.saveChain=this.saveChain.then(async()=>{
        try{validateProgress(message.progress,this.course);
          if(this.invalidProgress){await fsp.copyFile(this.progressFile,this.progressFile+'.invalid-'+Date.now());this.invalidProgress=false;}
          await this.persist(this.progressFile,message.progress);this.send({kind:'saved',request:message.request,success:true});this.emit('persisted',{request:message.request,saveToken:message.saveToken,success:true});
        }catch(error){this.send({kind:'saved',request:message.request,success:false,message:error.message});this.emit('persisted',{request:message.request,saveToken:message.saveToken,success:false,message:error.message});}
      });return this.saveChain;
    }
    if(message.kind==='stop'){this.cancelJobs();terminate(this.application);this.status(message,'Execução interrompida. Seu código foi preservado.');return;}
    if(message.revision!==this.revision){await this.analyze();this.status(message,'O código mudou. Confira a revisão atual e tente novamente.');return;}
    if(message.kind==='copyCode'){
      const solution=this.course.steps[message.step]?.solution;
      if(typeof solution!=='string')throw Error('Não há código disponível para este passo.');
      await this.onCopy(solution);
      this.status(message,'Código do passo copiado. Cole no VS Code com Ctrl+V, no local indicado em Onde escrever.');return;
    }
    if(message.kind==='verify'){
      const result=await this.job('verify',{step:message.step});if(result&&result.revision===this.revision)this.send({kind:'verification',request:message.request,step:message.step,...result.result});return;
    }
    if(message.kind==='run'||message.kind==='build'){
      terminate(this.application);const folder=path.join(path.dirname(this.file),'build',message.kind==='run'?'.companion-preview':`calculadora-${this.hash.slice(0,12)}`);
      const result=await this.job('build',{outDir:folder,optimize:message.kind==='run'?'-O0':'-O2'});
      if(!result||result.revision!==this.revision)return;
      if(!result.result.success){this.onDiagnostics(result.result.diagnostics);this.status(message,result.result.diagnostics[0]?.message||'A compilação falhou.');return;}
      if(message.kind==='build'){this.status(message,'Pacote gerado em '+path.dirname(result.result.executable)+'. Copie a pasta inteira para executar sem Node ou LLVM.');return;}
      this.application=spawn(result.result.executable,[],{stdio:['ignore','pipe','pipe'],env:this.nativeEnv||this.env,windowsHide:true,detached:process.platform!=='win32'});
      const current=this.application;let text='';for(const stream of [current.stdout,current.stderr])stream.on('data',b=>{if(text.length<8192)text+=b.toString();});
      current.on('error',error=>this.status(message,error.message));current.on('exit',code=>{if(this.application===current)this.status(message,code===0?'A calculadora foi encerrada.':`A calculadora terminou com código ${code}. ${text}`);});
      this.status(message,'A calculadora está em execução. Use Parar para interromper.');return;
    }
    if(message.kind==='explain'){await this.analyze();return;}
    if(message.kind==='navigate'){
      if(message.selection!==this.selection)return;
      const target=this.context?.relations[message.target];if(target)this.onNavigate(target);return;
    }
    if(message.kind==='where'){
      const step=this.course.steps[message.step],a=this.cache?.result;
      const name=message.step<12?step.functions.at(-1):message.step===13?'Botao':message.step===14?'Desenhar':[15,16].includes(message.step)?'Posicao':null;
      const fn=name&&a?.instructions.find(n=>n.kind==='function'&&n.name===name);
      let line=fn?.location.line;
      if(!line){const main=a?.instructions.find(n=>!n.owner&&!['function','endFunction'].includes(n.kind));line=main?.location.line||this.source.split(/\r?\n/).length;}
      this.onNavigate({file:this.file,line,column:1});return;
    }
    throw Error('Comando do companion não reconhecido.');
  }
  save(){
    if(!this.ready||this.disposed)return this.saveChain;
    if(this.saving)return this.saving;
    this.saving=new Promise((resolve,reject)=>{
      const saveToken=randomUUID();
      let request;
      const clean=()=>{clearTimeout(timer);this.off('received',received);this.off('persisted',persisted);this.off('exit',exited);this.off('failure',failed);};
      const received=p=>{if(p.kind==='save'&&p.saveToken===saveToken&&request===undefined)request=p.request;};
      const persisted=p=>{if(p.request!==request)return;clean();p.success?resolve():reject(Error(p.message));};
      const failed=e=>{clean();reject(e);};
      const exited=()=>failed(Error('A conexão foi encerrada antes de salvar o progresso.'));
      const timer=setTimeout(()=>failed(Error('Sem confirmação de salvamento. Use Salvar para tentar novamente.')),5000);
      this.on('received',received);this.on('persisted',persisted);this.on('exit',exited);this.on('failure',failed);
      try{this.command(10,{saveToken});}catch(e){failed(e);}
    }).finally(()=>{this.saving=null;});return this.saving;
  }
  command(action,extra={}){this.send({kind:'command',request:0,action,...extra});}
  cancel(op){const job=this.jobs.get(op);if(job){this.jobs.delete(op);job.cancel();}}
  cancelJobs(){for(const op of [...this.jobs.keys()])this.cancel(op);}
  dispose(){this.presentation.dispose();this.disposed=true;clearTimeout(this.debounce);this.cancelJobs();terminate(this.application);if(this.child){this.child.stdin.destroy();terminate(this.child);}this.removeAllListeners();}
}
module.exports={Session,Lines,defaults,validateProgress,atomicProgress,selectionContext,terminate,MAX_MESSAGE};
