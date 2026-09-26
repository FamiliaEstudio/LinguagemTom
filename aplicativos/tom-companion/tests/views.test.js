'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
const {Views,mapInput}=require('../../../tom-lang/companion/views');
const {Presentation}=require('../../../tom-lang/companion/presentation');
test('native presentation acknowledges discarded revisions and bounds input delivery',()=>{
 const owner=new EventEmitter();Object.assign(owner,{id:'s',headless:true,revision:2,ready:true,send:p=>sent.push(p)});const sent=[],p=new Presentation(owner);
 p.receive({v:1,kind:'viewState',session:'s',sequence:1,revision:1});assert.equal(p.state,null);assert.deepEqual(sent,[{kind:'viewAck',sequence:1}]);
 p.receive({v:1,kind:'viewState',session:'s',sequence:2,revision:2});assert.equal(p.state.sequence,2);
 p.input({type:4});p.input({type:10,x:1});p.input({type:10,x:2});p.input({type:11});assert.equal(p.queue.length,2);assert.equal(sent.filter(p=>p.kind==='input').length,1);
 p.receive({v:1,kind:'inputAck',session:'s',input:1});assert.equal(sent.at(-1).x,2);p.receive({v:1,kind:'inputAck',session:'s',input:2});assert.equal(sent.at(-1).type,11);p.dispose();
});
test('webview restore only displays state; assets are local and messages are restricted',async()=>{
 const providers=new Map(),messages=[],callbacks={start(){throw Error('Restore must never start tools');}},listeners={};
 const disposable={dispose(){}},uri={toString:()=> 'local-asset'};
 const vscode={Uri:{joinPath:()=>uri},window:{registerWebviewViewProvider:(id,p)=>{providers.set(id,p);return disposable;}}};
 const views=new Views(vscode,{extensionUri:uri},callbacks);
 const view={visible:true,onDidChangeVisibility:fn=>{listeners.visibility=fn;return disposable;},onDidDispose:fn=>{listeners.dispose=fn;return disposable;},webview:{asWebviewUri:()=>uri,cspSource:'vscode-resource:',postMessage:p=>messages.push(p),onDidReceiveMessage:()=>disposable}};
 providers.get('tom.companion.view').resolveWebviewView(view);await views.receive('companion',{kind:'ready'});assert.equal(messages.at(-1).kind,'idle');assert.match(view.webview.html,/default-src 'none'/);assert.match(view.webview.html,/nonce-/);assert.equal(view.webview.options.localResourceRoots.length,1);
 const session=new EventEmitter(),visibility=[],inputs=[];Object.assign(session,{id:'s',revision:3,ready:true,presentation:{sequence:5,setVisible:v=>visibility.push(v),input:v=>inputs.push(v)}});views.attach('companion',session);
 await views.receive('companion',{kind:'action',session:'s',revision:2,sequence:5,action:29});assert.equal(inputs.length,0);
 await views.receive('companion',{kind:'action',session:'s',revision:3,sequence:5,action:29});assert.equal(inputs.length,1);
 await assert.rejects(views.receive('companion',{kind:'action',session:'s',revision:3,sequence:5,action:999}),/inválida/);
 view.visible=false;listeners.visibility();assert.equal(visibility.at(-1),false);listeners.dispose();assert.equal(session.listenerCount('view'),1);views.dispose();assert.equal(session.listenerCount('view'),0);
});
test('map bridge rejects executable commands, nonfinite geometry and invalid keys',()=>{
 assert.throws(()=>mapInput({type:3,key:999}));assert.throws(()=>mapInput({type:4,x:NaN}));assert.throws(()=>mapInput({type:5,width:0}));assert.throws(()=>mapInput({type:100}));
 assert.equal(mapInput({type:12,dx:.25,dy:-.5}).dy,-.5);
});

test('view containers have valid manifest identifiers and explicit activation',()=>{
 const pkg=require('../../../tom-lang/package.json');
 for(const container of Object.values(pkg.contributes.viewsContainers).flat()){
  assert.match(container.id,/^[a-zA-Z0-9_-]+$/);assert.ok(pkg.contributes.views[container.id]);
  for(const view of pkg.contributes.views[container.id])assert.ok(pkg.activationEvents.includes('onView:'+view.id));
 }
});
