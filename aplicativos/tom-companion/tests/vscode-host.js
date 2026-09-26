'use strict';
// Invoked by Code --extensionTestsPath, never by the ordinary Node test runner.
const vscode=require('vscode'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../../..'),{Session}=require('../../../tom-lang/companion/session');
const {GraphSession}=require('../../../tom-lang/companion/graph-session');
const until=(emitter,event,predicate)=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>{emitter.off(event,listener);reject(Error('VS Code timeout: '+event));},25000);const listener=value=>{if(predicate(value)){clearTimeout(timer);emitter.off(event,listener);resolve(value);}};emitter.on(event,listener);});
exports.run=async()=>{
  const dir=path.join(root,'aplicativos/tom-companion/build/vscode',process.platform);fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'calculadora.tom'),'');fs.rmSync(path.join(dir,'.tom-companion'),{recursive:true,force:true});
  const {Views}=require('../../../tom-lang/companion/views'),originalResolve=Views.prototype.resolve,resolved=new Map();
  Views.prototype.resolve=function(kind,view){resolved.set(kind,view);return originalResolve.call(this,kind,view);};
  let session,map,driver;const copied=[];const original=Session.prototype.start,originalMap=GraphSession.prototype.start;Session.prototype.start=async function(){session=this;this.onCopy=async text=>copied.push(text);return original.call(this);};
  GraphSession.prototype.start=function(file){map=this;return originalMap.call(this,file);};
  const oldEvents=process.env.TOM_UI_EVENTS,events=path.join(dir,'events.txt');fs.writeFileSync(events,'wait 50\n'.repeat(1200));process.env.TOM_UI_EVENTS=events;process.env.SDL_VIDEODRIVER='invalid';process.env.SDL_RENDER_DRIVER='software';
  const config=vscode.workspace.getConfiguration('tom.companion');
  const previous=Object.fromEntries(['installation','toolchain'].map(key=>[key,config.inspect(key)?.globalValue]));
  try{
    assert.ok(vscode.workspace.isTrusted,'Test host must be trusted');
    await config.update('installation',undefined,vscode.ConfigurationTarget.Global);
    await config.update('toolchain',undefined,vscode.ConfigurationTarget.Global);
    const extension=vscode.extensions.all.find(e=>path.resolve(e.extensionPath).toLowerCase()===path.join(root,'tom-lang').toLowerCase());assert.ok(extension);await extension.activate();
    const initial=await vscode.workspace.openTextDocument(vscode.Uri.file(path.join(dir,'calculadora.tom')));await vscode.window.showTextDocument(initial);
    await vscode.commands.executeCommand('tom.companion.start');assert.ok(session,'Start must create the headless course');assert.equal(session.headless,true);assert.ok(map,'Start must also open the map');assert.equal(map.headless,true);
    const failures=[];session.on('failure',e=>failures.push(e.message));if(!session.ready)await until(session,'ready',()=>true);
    assert.ok(resolved.has('companion'));assert.ok(resolved.has('map'));
    if(process.env.TOM_WEBVIEW_TEST_PORT){
      driver=await require('./webview-driver').connect(process.env.TOM_WEBVIEW_TEST_PORT);
      await driver.wait('companion',"document.getElementById('objective-title')?.textContent.length>0");
      assert.equal(await driver.evaluate('companion',"document.querySelector('[data-action=\"2\"]').disabled"),true);
      const text=await driver.evaluate('companion',"document.getElementById('objective').textContent");
      await driver.evaluate('companion',"document.querySelector('[data-action=\"4\"]').click()");
      await driver.wait('companion',"document.getElementById('objective').textContent!=="+JSON.stringify(text));
      await driver.wait('map',"document.querySelectorAll('.node').length>0");
      assert.equal(await driver.evaluate('map',"document.querySelector('.map-body>svg').getBoundingClientRect().height>0"),true);

    }
    const firstSession=session;await vscode.commands.executeCommand('tom.companion.start',initial.uri);assert.equal(session,firstSession,'Editor title must preserve an already open session');
    const clipboard=until(session,'sent',p=>p.kind==='status'&&p.message.includes('copiado'));await vscode.commands.executeCommand('tom.companion.copyCode');await clipboard;
    assert.deepEqual(copied,[session.course.steps[0].solution]);
    const editor=await vscode.window.showTextDocument(initial),document=editor.document;
    const source=fs.readFileSync(path.join(root,'aplicativos/tom-companion/courses/calculadora/steps/00.tom'),'utf8');
    const edit=new vscode.WorkspaceEdit();edit.insert(document.uri,new vscode.Position(0,0),source);
    const analyzed=until(session,'sent',p=>p.kind==='analysis'&&p.compileSuccess);await vscode.workspace.applyEdit(edit);await analyzed;
    assert.ok(document.isDirty);assert.equal(fs.readFileSync(document.fileName,'utf8'),'');
    await vscode.window.showTextDocument(document);
    const line=source.split('\n').findIndex(l=>l.includes('Resultadoy@ULTIMO'));
    const selection=until(session,'sent',p=>p.kind==='analysis'&&p.last?.some(x=>x.resolved));editor.selection=new vscode.Selection(line,0,line,document.lineAt(line).text.length);await selection;
    const rev=session.revision;await vscode.commands.executeCommand('undo');assert.ok(session.revision>rev);assert.equal(session.source,'');await vscode.commands.executeCommand('redo');assert.equal(session.source.replace(/\r\n/g,'\n'),source);
    const checked=until(session,'sent',p=>p.kind==='verification');await vscode.commands.executeCommand('tom.companion.verify');const result=await checked;assert.equal(result.passed,true,JSON.stringify(result));
    await session.save();
    const navigation=until(session,'received',p=>p.kind==='navigate');session.command(28);await navigation;
    assert.equal(fs.readFileSync(document.fileName,'utf8'),'');assert.deepEqual(failures,[]);
    if(driver){
      if(map.model?.revision!==map.revision)await until(map,'published',p=>p.revision===map.revision);
      const moduleNode=map.model.nodes.find(n=>n.category===1);map.send({kind:'select',node:moduleNode.id});
      await driver.wait('map',"document.querySelector('.node.selected')!==null");
      await driver.evaluate('map',"document.querySelector('.map-body>svg').dispatchEvent(new KeyboardEvent('keydown',{key:' ',bubbles:true,cancelable:true}))");
      await driver.wait('map',"document.querySelectorAll('.node').length>1");
      const commands=await vscode.commands.getCommands();
      for(const command of ['workbench.action.closeAuxiliaryBar','notifications.clearAll'])if(commands.includes(command))await vscode.commands.executeCommand(command);
      const originalHeight=await driver.evaluate('map',"document.querySelector('.map-body>svg').getBoundingClientRect().height");
      await vscode.commands.executeCommand('workbench.action.toggleMaximizedPanel');
      await driver.wait('map',"document.querySelector('.map-body>svg').getBoundingClientRect().height>"+originalHeight);
      await vscode.commands.executeCommand('workbench.action.toggleMaximizedPanel');
      const focused=await vscode.window.showTextDocument(document);focused.selection=new vscode.Selection(line,0,line,document.lineAt(line).text.length);
      await driver.wait('companion',"document.getElementById('explanation').textContent.includes('Resultadoy@ULTIMO')");
      await driver.screenshot(path.join(dir,'integrated-dark.png'));
      const theme=vscode.workspace.getConfiguration('workbench'),previousTheme=theme.inspect('colorTheme')?.globalValue;
      try{await theme.update('colorTheme','Default Light Modern',vscode.ConfigurationTarget.Global);await driver.wait('companion',"document.body.classList.contains('vscode-light')");await driver.screenshot(path.join(dir,'integrated-light.png'));}
      finally{await theme.update('colorTheme',previousTheme,vscode.ConfigurationTarget.Global);}
    }
    // The integrated map can switch entry without starting a different course.
    const moduleFile=path.join(dir,'map-functions.tom'),mainFile=path.join(dir,'map-entry.tom');
    fs.writeFileSync(moduleFile,'DefFuncaoxF[]yVazio\nFimFuncao');fs.writeFileSync(mainFile,"Importar[l'./map-functions.tom']\nChamarxF[]");
    const main=await vscode.workspace.openTextDocument(vscode.Uri.file(mainFile));await vscode.window.showTextDocument(main);
    await vscode.commands.executeCommand('tom.companion.map');assert.ok(map);const mapFailures=[];map.on('failure',e=>mapFailures.push(e.message));
    if(!map.model)await until(map,'published',()=>true);
    const fn=map.model.nodes.find(n=>n.label==='F'),expanded=until(map,'published',()=>true);map.receive({v:1,session:map.session,revision:map.revision,kind:'expand',node:fn.id});await expanded;
    const moduleDocument=await vscode.workspace.openTextDocument(vscode.Uri.file(moduleFile));await vscode.window.showTextDocument(moduleDocument);
    const added=until(map,'published',v=>v.nodes.some(n=>n.label==='A')),moduleEdit=new vscode.WorkspaceEdit();moduleEdit.insert(moduleDocument.uri,new vscode.Position(1,0),'DefVarInSd32xAy1\n');await vscode.workspace.applyEdit(moduleEdit);await added;
    const a=map.model.nodes.find(n=>n.label==='A');assert.ok(moduleDocument.isDirty);assert.equal(fs.readFileSync(moduleFile,'utf8'),'DefFuncaoxF[]yVazio\nFimFuncao');
    const previousRevision=map.revision,comment=until(map,'published',v=>v.revision>previousRevision),commentEdit=new vscode.WorkspaceEdit();commentEdit.insert(moduleDocument.uri,new vscode.Position(0,0),'// comentário 🐈\n');await vscode.workspace.applyEdit(commentEdit);await comment;
    for(const command of ['undo','redo']){const revision=map.revision,changed=until(map,'published',v=>v.revision>revision);await vscode.commands.executeCommand(command);await changed;assert.equal(map.model.nodes.find(n=>n.label==='A').id,a.id);}
    assert.equal(map.model.nodes.find(n=>n.label==='A').id,a.id);map.select(moduleDocument.fileName,3);
    await map.onNavigate(map.model.locations[a.id]);assert.equal(vscode.window.activeTextEditor.selection.active.line,2);
    assert.deepEqual(mapFailures,[]);await vscode.commands.executeCommand('tom.companion.close');assert.ok(session.disposed);assert.ok(map.disposed);
    fs.writeFileSync(path.join(dir,'result.json'),JSON.stringify({platform:process.platform,automaticInstallation:true,activeCalculator:true,singleWindow:true,headless:true,integratedViews:true,webviewControls:!!driver,themeScreenshots:!!driver,copyCode:true,unsaved:true,undoRedo:true,selection:true,navigation:true,verified:true,sourcePreserved:true,codeMap:true,unsavedModules:true,stableGraphIds:true,graphNavigation:true},null,2));
    const discard=new vscode.WorkspaceEdit();discard.replace(document.uri,new vscode.Range(0,0,document.lineCount,0),'');await vscode.workspace.applyEdit(discard);await document.save();
  }finally{
    driver?.close();Views.prototype.resolve=originalResolve;session?.dispose();map?.dispose();Session.prototype.start=original;GraphSession.prototype.start=originalMap;if(oldEvents===undefined)delete process.env.TOM_UI_EVENTS;else process.env.TOM_UI_EVENTS=oldEvents;
    for(const [key,value] of Object.entries(previous))await config.update(key,value,vscode.ConfigurationTarget.Global);
  }
};
