'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{EventEmitter}=require('node:events');
const {activate,environment,projectFolder}=require('../../../tom-lang/companion/extension');
class Uri {constructor(file){this.fsPath=file;this.scheme='file';}static file(file){return new Uri(file);}}
const state=()=>{const values=new Map();return {get:key=>values.get(key),update:async(key,value)=>values.set(key,value)};};
function temporary(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'tom-companion-launch-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return dir;}
function installation(dir){
  const platform=process.platform==='win32'?'windows':'linux';
  const install=path.join(dir,'aplicativos/tom-companion/build',process.platform,'O2/companion'),tools=path.join(dir,'.tools',platform);
  for(const file of ['aplicativos/tom-companion/scripts/build.js','tom-lang/package.json']){fs.mkdirSync(path.dirname(path.join(dir,file)),{recursive:true});fs.writeFileSync(path.join(dir,file),'');}
  for(const file of [platform==='windows'?'node/node.exe':'node/bin/node',platform==='windows'?'llvm-mingw/bin/clang.exe':'llvm/usr/lib/llvm-21/bin/clang',platform==='windows'?'llvm/bin/opt.exe':'llvm/usr/lib/llvm-21/bin/opt','native/include/SDL3/SDL.h']){fs.mkdirSync(path.dirname(path.join(tools,file)),{recursive:true});fs.writeFileSync(path.join(tools,file),'');}
  fs.mkdirSync(install,{recursive:true});fs.writeFileSync(path.join(install,'companion'),'');
  fs.writeFileSync(path.join(install,'companion-install.json'),JSON.stringify({version:'0.1.0',protocol:1,platform:process.platform,executable:'companion',support:'support'}));
  return {install,tools};
}
test('finds the native package from repository subfolders and remembers it for an external project',t=>{
  const dir=temporary(t),{install,tools}=installation(dir),config=new Map(),context={globalState:state()};
  const vscode={window:{},workspace:{workspaceFolders:[{uri:Uri.file(path.join(dir,'tom-lang/exemplos'))}],getConfiguration:()=>({get:key=>config.get(key)})}};
  const result=environment(vscode,context);assert.equal(result.executable,path.join(install,'companion'));assert.equal(result.remember.toolchain,tools);
  context.globalState.update('tom.companion.environment',result.remember);vscode.workspace.workspaceFolders=[];
  assert.equal(environment(vscode,context).executable,result.executable);
  config.set('installation',path.join(dir,'missing'));assert.throws(()=>environment(vscode,context),/Instalação do Companion não encontrada/);
  config.clear();fs.rmSync(result.executable);assert.throws(()=>environment(vscode,context),/Executável do Companion não encontrado/);
});
test('resumes an active or remembered calculator; editor title file URIs are not treated as directories',async t=>{
  const dir=temporary(t),file=path.join(dir,'calculadora.tom');fs.writeFileSync(file,'meu código');
  const context={workspaceState:state()};let dialogs=0;
  const vscode={Uri,window:{activeTextEditor:{document:{uri:Uri.file(file),fileName:file}},showOpenDialog:async()=>{dialogs++;return [Uri.file(dir)];}}};
  assert.equal(await projectFolder(vscode,context,Uri.file(file)),dir);assert.equal(await projectFolder(vscode,context),dir);
  await context.workspaceState.update('tom.companion.lastProject',dir);vscode.window.activeTextEditor=undefined;
  assert.equal(await projectFolder(vscode,context),dir);assert.equal(dialogs,0);
  await projectFolder(vscode,context,undefined,true);assert.equal(dialogs,1);
  fs.rmSync(file);await projectFolder(vscode,context);assert.equal(dialogs,2);
});
function host(t,{trusted=true}={}){
  const dir=temporary(t),file=path.join(dir,'calculadora.tom');fs.writeFileSync(file,'conteúdo salvo');
  const commands=new Map(),messages=[],sessions=[],maps=[],context={globalState:state(),workspaceState:state()},shown=[];
  let dialogs=0,nextDirectory=dir;const changes={},disposable={dispose(){}};
  const event=name=>fn=>{changes[name]=fn;return disposable;};
  const doc={uri:Uri.file(file),fileName:file,languageId:'tom',lineCount:1,version:2,getText:()=> 'alterações não salvas'};
  const editor={document:doc,viewColumn:1,selection:{active:{line:0}}};
  const button={...disposable,show(){this.visible=true;},hide(){this.visible=false;}};
  const vscode={Uri,ViewColumn:{One:1},env:{clipboard:{writeText:async()=>{}}},StatusBarAlignment:{Left:1},commands:{registerCommand:(id,fn)=>{commands.set(id,fn);return disposable;}},
    languages:{createDiagnosticCollection:()=>({...disposable,clear(){},set(){}})},workspace:{isTrusted:trusted,textDocuments:[doc],onDidChangeTextDocument:event('change'),onDidOpenTextDocument:event('open'),openTextDocument:async uri=>uri.fsPath===file?doc:{...doc,uri,fileName:uri.fsPath},createFileSystemWatcher:()=>({...disposable,onDidChange:()=>disposable,onDidCreate:()=>disposable,onDidDelete:()=>disposable})},
    window:{activeTextEditor:editor,createStatusBarItem:()=>button,showTextDocument:async document=>({...editor,document}),showInformationMessage:s=>messages.push(s),showErrorMessage:s=>messages.push(s),showOpenDialog:async()=>{dialogs++;return nextDirectory?[Uri.file(nextDirectory)]:undefined;},onDidChangeTextEditorSelection:event('selection'),onDidChangeActiveTextEditor:event('active')}};
  class FakeSession extends EventEmitter{
    constructor(options){super();Object.assign(this,options);this.presentation={setVisible(){}};this.projectFiles=new Set();this.saved=0;this.actions=[];(options.mapExecutable?maps:sessions).push(this);}
    update(source){this.source=source;}
    async start(file){if(file)this.file=file;this.child={exitCode:null,signalCode:null};this.ready=true;this.emit('ready');}
    async save(){if(this.failSave)throw Error('Disco indisponível');this.saved++;}
    command(action){this.actions.push(action);}
    dispose(){this.disposed=true;this.ready=false;}
    select(file,line){this.selection={file,line};}
  }
  class FakeViews {constructor(){this.bound={};}attach(kind,s){this.bound[kind]=s;}show(kind){shown.push(kind);}error(kind,e){messages.push(e.message);}reset(){this.bound={};}dispose(){}}
  const extension=activate(vscode,context,{SessionClass:FakeSession,GraphSessionClass:FakeSession,ViewsClass:FakeViews,resolveEnvironment:()=>({root:dir,headlessExecutable:'headless',headlessMapExecutable:'map-headless',remember:{installation:'remembered'}})});t.after(()=>extension.dispose());
  return {commands,messages,sessions,maps,shown,file,doc,editor,changes,context,button,vscode,extension,get dialogs(){return dialogs;},setDirectory:d=>{nextDirectory=d;}};
}
test('untrusted workspaces never start tools or project dialogs',async t=>{
 const h=host(t,{trusted:false});assert.equal(h.commands.size,10);
 for(const command of h.commands.values())await command();
 assert.equal(h.sessions.length,0);assert.equal(h.maps.length,0);assert.equal(h.dialogs,0);assert.equal(h.messages.length,10);assert.ok(h.messages.every(m=>m.includes('Confie nesta pasta')));
});
test('one command opens both integrated views; repeats reuse sessions and retain the text editor',async t=>{
 const h=host(t);
 await Promise.all([h.commands.get('tom.companion.start')(Uri.file(h.file)),h.commands.get('tom.companion.start')()]);
 assert.equal(h.sessions.length,1);assert.equal(h.maps.length,1);assert.equal(h.sessions[0].headless,true);assert.equal(h.maps[0].mapExecutable,'map-headless');assert.equal(h.dialogs,0);assert.deepEqual(h.shown,['companion','map']);
 h.vscode.window.activeTextEditor=undefined;h.changes.active(undefined);
 await h.commands.get('tom.companion.start')();await h.commands.get('tom.companion.map')();
 assert.equal(h.sessions.length,1);assert.equal(h.maps.length,1);assert.equal(h.sessions[0].source,'alterações não salvas');assert.equal(fs.readFileSync(h.file,'utf8'),'conteúdo salvo');
 await h.commands.get('tom.companion.close')();assert.equal(h.sessions[0].saved,1);assert.equal(h.sessions[0].disposed,true);assert.equal(h.maps[0].disposed,true);
 await h.commands.get('tom.companion.start')();assert.equal(h.sessions.length,2);assert.equal(h.maps.length,2);
});
test('switch and close preserve the current session on save failure; cancel does not save or dispose',async t=>{
 const h=host(t);await h.commands.get('tom.companion.start')();const first=h.sessions[0],oldMap=h.maps[0],other=temporary(t);
 h.setDirectory(undefined);await h.commands.get('tom.companion.chooseProject')();assert.equal(first.saved,0);assert.ok(!first.disposed);
 h.setDirectory(other);first.failSave=true;
 await h.commands.get('tom.companion.chooseProject')();await h.commands.get('tom.companion.close')();assert.ok(!first.disposed);assert.ok(!oldMap.disposed);assert.equal(h.sessions.length,1);assert.match(h.messages.at(-1),/Disco indisponível/);
 first.failSave=false;await h.commands.get('tom.companion.chooseProject')();assert.equal(first.saved,1);assert.ok(first.disposed);assert.ok(oldMap.disposed);assert.equal(h.sessions.length,2);assert.equal(h.maps.length,2);assert.equal(h.sessions[1].file,path.join(other,'calculadora.tom'));
});
test('map alone never creates a calculator or starts its course',async t=>{
 const h=host(t);await h.commands.get('tom.companion.map')();assert.equal(h.sessions.length,0);assert.equal(h.maps.length,1);assert.equal(h.maps[0].file,h.file);assert.equal(h.dialogs,0);
});
