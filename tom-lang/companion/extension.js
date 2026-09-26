'use strict';
const fs=require('node:fs'),path=require('node:path');
const {Session}=require('./session');
const {GraphSession}=require('./graph-session');
const LAST_PROJECT='tom.companion.lastProject',LAST_ENVIRONMENT='tom.companion.environment';
function repositoryAbove(directory){
  if(!directory)return null;
  for(let current=path.resolve(directory);;current=path.dirname(current)){
    if(fs.existsSync(path.join(current,'aplicativos/tom-companion/scripts/build.js'))&&fs.existsSync(path.join(current,'tom-lang/package.json')))return current;
    if(current===path.dirname(current))return null;
  }
}
function environment(vscode,context={}){
  const config=vscode.workspace.getConfiguration('tom.companion');
  const remembered=context.globalState?.get(LAST_ENVIRONMENT)||{};
  const active=vscode.window.activeTextEditor?.document.uri;
  const candidates=[...(vscode.workspace.workspaceFolders||[]).map(folder=>folder.uri.fsPath),...(active?.scheme==='file'?[path.dirname(active.fsPath)]:[])];
  const detected=candidates.map(repositoryAbove).find(Boolean);
  const repository=detected||repositoryAbove(remembered.repository)||repositoryAbove(path.resolve(__dirname,'../..'));
  const platform=process.platform==='win32'?'windows':'linux';
  const installation=config.get('installation')||(detected?path.join(detected,'aplicativos/tom-companion/build',process.platform,'O2/companion'):remembered.installation)||(repository&&path.join(repository,'aplicativos/tom-companion/build',process.platform,'O2/companion'));
  if(!installation)throw Error('Abra a pasta do repositório Tom para detectar a instalação ou configure tom.companion.installation com a pasta do pacote extraído.');
  const manifestPath=path.join(installation,'companion-install.json');
  if(!fs.existsSync(manifestPath))throw Error('Instalação do Companion não encontrada. Execute node aplicativos/tom-companion/scripts/build.js no ambiente Tom ou configure tom.companion.installation para a pasta do pacote extraído.');
  const manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8'));
  if(manifest.version!=='0.1.0'||manifest.protocol!==1||manifest.platform!==process.platform)throw Error('Pacote do Companion incompatível com esta plataforma. No WSL, use o pacote Linux.');
  const root=path.resolve(installation,manifest.support);
  const localTools=path.join(root,'.tools',platform);
  const tools=config.get('toolchain')||(fs.existsSync(localTools)?localTools:detected?path.join(detected,'.tools',platform):remembered.toolchain||(repository&&path.join(repository,'.tools',platform)));
  if(!tools)throw Error('Configure tom.companion.toolchain com a pasta .tools/'+platform+' das ferramentas preparadas.');
  const node=path.join(tools,platform==='windows'?'node/node.exe':'node/bin/node');
  const clang=path.join(tools,platform==='windows'?'llvm-mingw/bin/clang.exe':'llvm/usr/lib/llvm-21/bin/clang');
  const opt=path.join(tools,platform==='windows'?'llvm/bin/opt.exe':'llvm/usr/lib/llvm-21/bin/opt');
  for(const file of [node,clang,opt,path.join(tools,'native/include/SDL3/SDL.h')])if(!fs.existsSync(file))throw Error('Ferramentas incompletas. Prepare support/scripts/setup-'+(platform==='windows'?'windows.ps1':'linux.sh')+' no pacote, ou configure tom.companion.toolchain para sua pasta .tools/'+platform+'.');
  const env={CLANG:clang,LLVM_OPT:opt,TOM_NATIVE_ROOT:path.join(tools,'native')};
  if(platform==='linux')env.LD_LIBRARY_PATH=path.join(tools,'llvm/usr/lib/x86_64-linux-gnu')+(process.env.LD_LIBRARY_PATH?':'+process.env.LD_LIBRARY_PATH:'');
  const executable=path.resolve(installation,manifest.executable);
  if(!fs.existsSync(executable))throw Error('Executável do Companion não encontrado: '+executable+'. Reconstrua ou extraia novamente o pacote.');
  const mapExecutable=manifest.mapExecutable?path.resolve(installation,manifest.mapExecutable):undefined;
  const integrated=manifest.capabilities?.includes('companion-view-v1')&&manifest.capabilities?.includes('graph-view-v1');
  const headlessExecutable=integrated&&manifest.headlessExecutable?path.resolve(installation,manifest.headlessExecutable):undefined;
  const headlessMapExecutable=integrated&&manifest.headlessMapExecutable?path.resolve(installation,manifest.headlessMapExecutable):undefined;
  for(const file of [headlessExecutable,headlessMapExecutable])if(file&&!fs.existsSync(file))throw Error('Reconstrua o pacote do Companion: processo integrado não encontrado.');
  return {root,node,executable,mapExecutable,headlessExecutable,headlessMapExecutable,env,remember:{repository,installation,toolchain:tools}};
}
async function projectFolder(vscode,context,requested,choose=false){
  if(!choose&&requested instanceof vscode.Uri&&requested.scheme==='file'){
    const stat=await fs.promises.stat(requested.fsPath);
    if(stat.isDirectory())return requested.fsPath;
    if(stat.isFile()&&path.basename(requested.fsPath)==='calculadora.tom')return path.dirname(requested.fsPath);
  }
  if(!choose){
    const doc=vscode.window.activeTextEditor?.document;
    if(doc?.uri.scheme==='file'&&!doc.isUntitled&&path.basename(doc.fileName)==='calculadora.tom')return path.dirname(doc.fileName);
    const remembered=context.workspaceState?.get(LAST_PROJECT);
    if(remembered&&fs.existsSync(path.join(remembered,'calculadora.tom')))return remembered;
  }
  const selection=await vscode.window.showOpenDialog({canSelectFiles:false,canSelectFolders:true,canSelectMany:false,openLabel:'Criar ou retomar calculadora nesta pasta'});
  return selection?.[0]?.fsPath;
}
function activate(vscode,context,{SessionClass=Session,GraphSessionClass=GraphSession,ViewsClass=require('./views').Views,resolveEnvironment=environment}={}){
  let session,map,starting,mapStarting,closing,lastEditor=vscode.window.activeTextEditor;
  const subscriptions=[];
  const diagnostics=vscode.languages.createDiagnosticCollection('tom-companion');subscriptions.push(diagnostics);
  const graphDiagnostics=vscode.languages.createDiagnosticCollection('tom-map');subscriptions.push(graphDiagnostics);
  const report=error=>vscode.window.showErrorMessage('Tom Companion: '+error.message);
  const allowed=()=>{if(!vscode.workspace.isTrusted){vscode.window.showInformationMessage('Confie nesta pasta no VS Code para iniciar as ferramentas do Companion.');return false;}return true;};
  const alive=s=>s&&!s.disposed&&s.child&&s.child.exitCode===null&&s.child.signalCode===null&&(!s.worker||(s.worker.exitCode===null&&s.worker.signalCode===null));
  const views=new ViewsClass(vscode,context,{start:kind=>kind==='map'?startMap(undefined,true):start(undefined,false,true),close:()=>close(),blocked:()=>!!closing||!!starting});subscriptions.push(views);
  const button=vscode.window.createStatusBarItem?.('tom.companion',vscode.StatusBarAlignment.Left,10);
  if(button){button.name='Tom Companion';button.command='tom.companion.start';subscriptions.push(button);}
  const refreshButton=()=>{
    if(!button)return;
    button.text=starting?'$(loading~spin) Tom Companion':alive(session)?'$(open-preview) Companion aberto':'$(open-preview) Tom Companion';
    button.tooltip='Abrir o Tom Companion — Ctrl+Alt+Shift+T';
    if(lastEditor?.document.languageId==='tom'||alive(session))button.show();else button.hide();
  };
  const cursor=doc=>lastEditor?.document===doc?lastEditor.selection.active.line+1:1;
  const navigate=async(target,root)=>{
    const file=target.file.startsWith('tom/')?path.join(root,'tom-lang/stdlib',target.file.slice(4)+'.tom'):target.file;
    const doc=await vscode.workspace.openTextDocument(vscode.Uri.file(file));
    const editor=await vscode.window.showTextDocument(doc,{viewColumn:lastEditor?.viewColumn||vscode.ViewColumn.One,preview:false});
    lastEditor=editor;
    const position=doc.validatePosition(new vscode.Position(Math.max(0,target.line-1),Math.max(0,target.column-1)));
    editor.selection=new vscode.Selection(position,position);editor.revealRange(new vscode.Range(position,position),vscode.TextEditorRevealType.InCenterIfOutsideViewport);
  };
  const remember=async settings=>{if(settings.remember)await context.globalState?.update(LAST_ENVIRONMENT,settings.remember);};
  const openMap=async(file,restart=false,settings)=>{
    if(!allowed()||closing)return;
    if(!file&&(!restart||!map)){
      const doc=lastEditor?.document;
      if(doc&&!doc.isUntitled&&doc.uri.scheme==='file'&&doc.fileName.endsWith('.tom'))file=doc.fileName;
    }
    if(!file&&restart&&map)file=map.file;
    if(!file){const selection=await vscode.window.showOpenDialog({canSelectFiles:true,canSelectFolders:false,canSelectMany:false,filters:{Tom:['tom']},openLabel:'Arquivo de entrada do mapa'});if(!selection?.length)return;file=selection[0].fsPath;}
    if(alive(map)&&!restart&&path.resolve(map.file)===path.resolve(file)){await views.show('map');return;}
    settings=settings||resolveEnvironment(vscode,context);
    if(!settings.headlessMapExecutable)throw Error('Atualize ou reconstrua o pacote do Companion para incluir o mapa integrado.');
    if(map)map.dispose();graphDiagnostics.clear();
    map=new GraphSessionClass({...settings,headless:true,mapExecutable:settings.headlessMapExecutable,
      documents:()=>vscode.workspace.textDocuments.filter(d=>d.uri.scheme==='file'&&!d.isUntitled).map(d=>({file:d.fileName,source:d.getText(),revision:d.version})),
      onNavigate:target=>navigate(target,settings.root),
      onDiagnostics:items=>{
        const groups=new Map();
        for(const item of items){const file=item.file.startsWith('tom/')?path.join(settings.root,'tom-lang/stdlib',item.file.slice(4)+'.tom'):item.file;
          if(!groups.has(file))groups.set(file,[]);
          const line=Math.max(0,item.line-1),column=Math.max(0,item.column-1),diagnostic=new vscode.Diagnostic(new vscode.Range(line,column,line,column+1),item.message,vscode.DiagnosticSeverity.Error);
          diagnostic.code=item.code;diagnostic.source='Tom mapa';groups.get(file).push(diagnostic);
        }
        graphDiagnostics.clear();for(const [file,items] of groups)graphDiagnostics.set(vscode.Uri.file(file),items);
      }
    });
    map.on('failure',report);map.on('exit',()=>graphDiagnostics.clear());views.attach('map',map);map.start(file);await views.show('map');await remember(settings);
  };
  const startMap=(file,restart=false,settings)=>{
    if(mapStarting)return mapStarting;
    mapStarting=Promise.resolve().then(()=>openMap(file,restart,settings)).finally(()=>{mapStarting=null;});return mapStarting;
  };
  const open=async(folder,choose,restart)=>{
    if(!allowed()||closing)return;
    if(alive(session)&&!choose&&!restart){await views.show('companion');await startMap(session.file);return;}
    const settings=resolveEnvironment(vscode,context);
    if(!settings.headlessExecutable)throw Error('Atualize ou reconstrua o pacote do Companion para incluir os painéis integrados.');
    const requested=folder||(!choose&&lastEditor?.document.uri);
    const directory=await projectFolder(vscode,context,requested,choose);if(!directory)return;
    if(session){if(alive(session))await session.save();session.dispose();}
    const file=path.join(directory,'calculadora.tom');
    try{const handle=await fs.promises.open(file,'wx');await handle.close();}catch(error){if(error.code!=='EEXIST')throw error;}
    const doc=await vscode.workspace.openTextDocument(vscode.Uri.file(file));
    lastEditor=await vscode.window.showTextDocument(doc,{viewColumn:lastEditor?.viewColumn||vscode.ViewColumn.One,preview:false});
    diagnostics.clear();
    session=new SessionClass({...settings,headless:true,executable:settings.headlessExecutable,file,
      onCopy:text=>vscode.env.clipboard.writeText(text),
      onNavigate:target=>{if(path.resolve(target.file)===path.resolve(file))return navigate(target,settings.root);},
      onDiagnostics:items=>diagnostics.set(vscode.Uri.file(file),items.map(item=>{
        const line=Math.max(0,Math.min(doc.lineCount-1,item.line-1)),start=Math.max(0,item.column-1);
        const diagnostic=new vscode.Diagnostic(new vscode.Range(line,start,line,Math.max(start+1,doc.lineAt(line).text.length)),item.message,vscode.DiagnosticSeverity.Error);diagnostic.code=item.code;diagnostic.source='Tom Companion';return diagnostic;
      })),
    });
    session.on('failure',report);session.on('ready',refreshButton);session.on('exit',refreshButton);views.attach('companion',session);
    session.update(doc.getText(),cursor(doc));await session.start();await views.show('companion');
    await context.workspaceState?.update(LAST_PROJECT,directory);await remember(settings);
    // Map startup failure leaves the running course available for recovery.
    try{await startMap(file,false,settings);}catch(error){views.error('map',error);report(error);}
  };
  const start=(folder,choose=false,restart=false)=>{
    if(starting)return starting;
    starting=Promise.resolve().then(()=>open(folder,choose,restart)).finally(()=>{starting=null;refreshButton();});refreshButton();return starting;
  };
  const close=()=>{
    if(!allowed())return;
    if(closing)return closing;
    closing=Promise.resolve().then(async()=>{
      await starting;await mapStarting;
      if(alive(session))await session.save();
      session?.dispose();map?.dispose();session=null;map=null;diagnostics.clear();graphDiagnostics.clear();views.reset();
    }).finally(()=>{closing=null;refreshButton();});return closing;
  };
  const register=(name,fn)=>subscriptions.push(vscode.commands.registerCommand(name,(...args)=>Promise.resolve().then(()=>fn(...args)).catch(report)));
  register('tom.companion.start',start);register('tom.companion.chooseProject',()=>start(undefined,true));register('tom.companion.map',()=>startMap());register('tom.companion.close',close);
  for(const [name,action] of [['explain',12],['verify',1],['run',7],['stop',8],['build',9],['copyCode',29]])register('tom.companion.'+name,()=>{
    if(!allowed()||closing)return;
    if(!session?.ready){vscode.window.showInformationMessage('Inicie o Companion antes de usar este comando.');return;}
    session.command(action);
  });
  subscriptions.push(vscode.workspace.onDidChangeTextDocument(event=>{
    if(session&&!session.disposed&&event.document.fileName===session.file)try{session.update(event.document.getText(),cursor(event.document));}catch(error){report(error);}
    if(map&&!map.disposed&&event.document.fileName.endsWith('.tom'))map.update(400,{file:event.document.fileName,fromRevision:event.document.version-1,toRevision:event.document.version,changes:event.contentChanges.map(c=>({rangeOffset:c.rangeOffset,rangeLength:c.rangeLength,text:c.text}))});
  }));
  subscriptions.push(vscode.window.onDidChangeTextEditorSelection(event=>{
    if(event.textEditor.document.languageId==='tom')lastEditor=event.textEditor;
    if(session&&!session.disposed&&event.textEditor.document.fileName===session.file)try{session.update(event.textEditor.document.getText(),event.selections[0].active.line+1);}catch(error){report(error);}
    if(map&&!map.disposed)map.select(event.textEditor.document.fileName,event.selections[0].active.line+1);
  }));
  subscriptions.push(vscode.workspace.onDidOpenTextDocument(document=>{if(session&&!session.disposed&&document.fileName===session.file)session.update(document.getText(),cursor(document));}));
  subscriptions.push(vscode.window.onDidChangeActiveTextEditor(editor=>{if(editor?.document.languageId==='tom')lastEditor=editor;refreshButton();}));
  const watcher=vscode.workspace.createFileSystemWatcher('**/*.tom'),update=()=>{if(map&&!map.disposed)map.update();};subscriptions.push(watcher,watcher.onDidChange(update),watcher.onDidCreate(update),watcher.onDidDelete(update));
  refreshButton();
  return {owns(file){return (!!session&&!session.disposed&&session.file===file)||!!map&&!map.disposed&&map.projectFiles.has(file.replace(/\\/g,'/'));},async shutdown(){if(alive(session))await session.save();},dispose(){session?.dispose();map?.dispose();for(const subscription of subscriptions)subscription.dispose();}};
}
module.exports={activate,environment,projectFolder,repositoryAbove};
