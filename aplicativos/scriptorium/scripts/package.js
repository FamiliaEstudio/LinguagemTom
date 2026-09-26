'use strict';
const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto');
const {compileResolved}=require('../../../tom-lang/core/module-loader');
const {buildApplication,platform,command,toolchain}=require('../../../tom-lang/core/native-build');
function packageApplication({optimize='-O2',testUI=false,outDir}={}){
 const file=path.resolve(__dirname,'../src/scriptorium.tom');
 const result=compileResolved(fs.readFileSync(file,'utf8'),{file});
 if(!result.success)throw Error(JSON.stringify(result.diagnostics,null,2));
 const assets=path.resolve(__dirname,'../assets');
 let iconObject, scratch;
 if(process.platform==='win32'){
  const parent=path.join(platform,'scriptorium');fs.mkdirSync(parent,{recursive:true});
  scratch=fs.mkdtempSync(path.join(parent,'icon-'));iconObject=path.join(scratch,'icon.o');
  const windres=path.join(platform,'llvm-mingw/bin/x86_64-w64-mingw32-windres.exe');
  command(windres,['-i','icon.rc','-o',iconObject,'-O','coff'],{cwd:assets});
 }
 let binary;
 try{
  binary=buildApplication(result,file,outDir||path.join(platform,'scriptorium',testUI?'test':'packages',optimize.slice(1)),{optimize,testUI,linkObjects:iconObject?[iconObject]:[]});
  const directory=path.dirname(binary);
  for(const name of ['scriptorium.svg','scriptorium.png','scriptorium.ico'])fs.copyFileSync(path.join(assets,name),path.join(directory,name));
  if(process.platform==='win32'&&!testUI){
   fs.copyFileSync(path.join(__dirname,'Instalar-Scriptorium.ps1'),path.join(directory,'Instalar-Scriptorium.ps1'));
   command(toolchain().clang,['-O2','-mwindows',path.join(__dirname,'installer.c'),iconObject,'-o',path.join(directory,'Instalar-Scriptorium.exe')]);
   command(toolchain().clang,['-O2','-mwindows',path.join(__dirname,'launcher.c'),iconObject,'-o',path.join(directory,'Abrir-Scriptorium.exe')]);
  }
 }finally{if(scratch)fs.rmSync(scratch,{recursive:true,force:true});}
 const directory=path.dirname(binary);
 for(const name of ['README.md','CONTRATOS.md','ROADMAP.md','VALIDACAO.md']){const source=path.join(__dirname,'..',name);if(fs.existsSync(source))fs.copyFileSync(source,path.join(directory,name));}
 const files=[];function inventory(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const target=path.join(dir,entry.name);if(entry.isDirectory())inventory(target);else if(entry.name!=='scriptorium-package.json')files.push({path:path.relative(directory,target).replaceAll('\\','/'),sha256:createHash('sha256').update(fs.readFileSync(target)).digest('hex')});}}inventory(directory);
 const lock=require('../../../scripts/toolchain.json');fs.writeFileSync(path.join(directory,'scriptorium-package.json'),JSON.stringify({application:'Scriptorium',version:'0.1.0',schema:1,optimize,testUI,platform:process.platform,dependencies:{miniz:lock.miniz,libxml2:lock.libxml2},files},null,2)+'\n');
 return binary;
}
function archivePackage(binary){
 const windows=process.platform==='win32',directory=path.dirname(binary),extension=windows?'.zip':'.tar.gz';
 const destination=path.join(platform,'scriptorium/packages',`Scriptorium-${windows?'windows':'linux'}-x64${extension}`),temporary=destination+'.partial'+extension;
 try{command(windows?path.join(process.env.SystemRoot,'System32/tar.exe'):'tar',windows?['-a','-cf',temporary,'-C',path.dirname(directory),path.basename(directory)]:['-czf',temporary,'-C',path.dirname(directory),path.basename(directory)]);fs.renameSync(temporary,destination);}finally{fs.rmSync(temporary,{force:true});}
 fs.writeFileSync(destination+'.sha256',createHash('sha256').update(fs.readFileSync(destination)).digest('hex')+'  '+path.basename(destination)+'\n');return destination;
}
module.exports={packageApplication,archivePackage};
if(require.main===module){const binary=packageApplication({optimize:process.argv.includes('--debug')?'-O0':'-O2',testUI:process.argv.includes('--test-ui')});console.log(binary);if(process.argv.includes('--zip'))console.log(archivePackage(binary));}
