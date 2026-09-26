'use strict';
const {randomBytes}=require('node:crypto');
const IDS={companion:'tom.companion.view',map:'tom.companion.mapView'};
const ACTIONS=new Set([1,2,3,4,5,6,7,8,9,10,11,12,27,28,29]);
const KEYS=new Set([9,13,32,109,112,114,1073741904,1073741903,1073741906,1073741905,1073741902,1073741899,...Array.from({length:9},(_,i)=>48+i)]);
function mapInput(value){
  if(![3,4,5,8,10,11,12].includes(value.type))throw Error('Evento do mapa inválido.');
  const result={type:value.type,key:0,x:0,y:0,dx:0,dy:0,width:800,height:400};
  for(const field of ['x','y','dx','dy','width','height'])if(value[field]!==undefined){
    if(!Number.isFinite(value[field])||Math.abs(value[field])>1000000)throw Error('Coordenada do mapa inválida.');result[field]=value[field];
  }
  if(result.width<=0||result.height<=0)throw Error('Dimensão do mapa inválida.');
  if(value.type===3){if(!KEYS.has(value.key))throw Error('Tecla do mapa inválida.');result.key=value.key;}
  if(typeof value.reduced==='boolean')result.reduced=value.reduced;
  return result;
}
class Views {
  constructor(vscode,context,callbacks){
    Object.assign(this,{vscode,context,callbacks});this.slots={companion:{},map:{}};this.disposables=[];
    for(const kind of Object.keys(IDS))this.disposables.push(vscode.window.registerWebviewViewProvider(IDS[kind],{resolveWebviewView:view=>this.resolve(kind,view)}));
  }
  resolve(kind,view){
    const slot=this.slots[kind];slot.view=view;
    view.webview.options={enableScripts:true,localResourceRoots:[this.vscode.Uri.joinPath(this.context.extensionUri,'companion','media')]};
    view.webview.html=this.html(kind,view.webview);
    const subscriptions=[view.webview.onDidReceiveMessage(message=>{
      Promise.resolve().then(()=>this.receive(kind,message)).catch(error=>this.error(kind,error));
    }),view.onDidChangeVisibility(()=>slot.session?.presentation.setVisible(view.visible)),view.onDidDispose(()=>{
      if(slot.view===view){slot.view=null;slot.session?.presentation.setVisible(false);}
      for(const subscription of subscriptions)subscription.dispose();
    })];
    slot.session?.presentation.setVisible(view.visible);
  }
  attach(kind,session){
    const slot=this.slots[kind];this.detach(kind);slot.session=session;
    const state=p=>this.post(kind,p),failure=e=>this.error(kind,e),exit=()=>this.error(kind,Error('Sessão encerrada. Abra novamente para retomar.'));
    session.on('view',state);session.on('failure',failure);session.on('exit',exit);
    slot.unbind=()=>{session.off('view',state);session.off('failure',failure);session.off('exit',exit);};
    session.presentation.setVisible(!!slot.view?.visible);
    this.post(kind,{kind:'loading'});
  }
  detach(kind){const slot=this.slots[kind];slot.unbind?.();slot.unbind=null;slot.session=null;}
  async show(kind){await this.vscode.commands.executeCommand(IDS[kind]+'.focus');this.slots[kind].view?.show(true);}
  post(kind,message){this.slots[kind].view?.webview.postMessage(message);}
  error(kind,error){this.post(kind,{kind:'failure',message:error.message});}
  reset(){for(const kind of Object.keys(IDS)){this.detach(kind);this.post(kind,{kind:'idle'});}}
  async receive(kind,message){
    if(!message||typeof message!=='object')return;
    const session=this.slots[kind].session;
    if(message.kind==='ready'){
      this.post(kind,session?.presentation.state||{kind:session?'loading':'idle'});
      session?.presentation.setVisible(!!this.slots[kind].view?.visible);return;
    }
    if(message.kind==='start')return this.callbacks.start(kind);
    if(message.kind==='close')return this.callbacks.close();
    if(this.callbacks.blocked?.())return;
    if(!session?.ready||session.disposed)throw Error('Abra o Companion para conectar os controles.');
    if(message.session!==(session.id||session.session)||message.revision!==session.revision)return;
    if(kind==='companion'){
      if(message.kind!=='action'||!ACTIONS.has(message.action))throw Error('Ação do Companion inválida.');
      if(message.sequence!==session.presentation.sequence)return;
      session.presentation.input({action:message.action,revision:message.revision,viewSequence:message.sequence});
    }else{
      if(message.kind!=='input')throw Error('Evento do mapa inválido.');
      session.presentation.input({...mapInput(message),revision:message.revision});
    }
  }
  html(kind,webview){
    const base=this.vscode.Uri.joinPath(this.context.extensionUri,'companion','media');
    const uri=name=>webview.asWebviewUri(this.vscode.Uri.joinPath(base,name)).toString();
    const nonce=randomBytes(18).toString('base64');
    return `<!doctype html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';"><link rel="stylesheet" href="${uri('views.css')}"></head><body data-view="${kind}"><div id="message" role="status"></div><div class="session"><button id="start">${kind==='map'?'Abrir mapa':'Abrir Tom Companion'}</button><button id="close" hidden>Encerrar</button></div><main id="content" hidden></main><script nonce="${nonce}" src="${uri('views.js')}"></script></body></html>`;
  }
  dispose(){for(const kind of Object.keys(IDS))this.detach(kind);for(const item of this.disposables)item.dispose();}
}
module.exports={Views,mapInput,IDS,ACTIONS};
