'use strict';
const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto'),{spawnSync}=require('node:child_process');
const {build}=require('./build');
const root=path.resolve(__dirname,'../../..');
const extension=spawnSync(process.execPath,[path.join(root,'scripts/package-extension.js')],{stdio:'inherit',timeout:120000});
if(extension.error)throw extension.error;if(extension.status!==0)throw Error('Prepare npm ci --prefix tom-lang --ignore-scripts antes de gerar o pacote com a extensão.');
const executable=build(),directory=path.dirname(executable),files={};
const vsix='tom-lang-'+require(path.join(root,'tom-lang/package.json')).version+'.vsix';
fs.copyFileSync(path.join(root,'tom-lang/build',vsix),path.join(directory,vsix));
function visit(folder){for(const entry of fs.readdirSync(folder,{withFileTypes:true})){const full=path.join(folder,entry.name);if(entry.isDirectory())visit(full);else if(entry.isFile()&&entry.name!=='SHA256.json')files[path.relative(directory,full).split(path.sep).join('/')]=createHash('sha256').update(fs.readFileSync(full)).digest('hex');}}
visit(directory);fs.writeFileSync(path.join(directory,'SHA256.json'),JSON.stringify({version:'0.1.0',files},null,2)+'\n');
const archives=path.join(__dirname,'../build/packages');fs.mkdirSync(archives,{recursive:true});
const archive=path.join(archives,`tom-companion-0.1.0-${process.platform==='win32'?'windows':'linux'}-${process.arch}.${process.platform==='win32'?'zip':'tar.gz'}`);
const result=spawnSync(process.platform==='win32'?'tar.exe':'tar',[...(process.platform==='win32'?['-a','-cf']:['-czf']),archive,'-C',path.dirname(directory),path.basename(directory)],{encoding:'utf8',timeout:120000});
if(result.error)throw result.error;if(result.status!==0)throw Error(result.stderr);
fs.writeFileSync(archive+'.sha256',createHash('sha256').update(fs.readFileSync(archive)).digest('hex')+'  '+path.basename(archive)+'\n');console.log(archive);
