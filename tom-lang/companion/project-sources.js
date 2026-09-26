'use strict';
const fs=require('node:fs'),path=require('node:path');
const {discoverImports}=require('../core/recovery');
const {normalize,resolve}=require('../core/modules');
// Filesystem boundary. Open editor documents take precedence over disk, even
// when the editor has not saved them or currently contains invalid syntax.
async function collectProject(entry,documents=[],root=path.resolve(__dirname,'../..')){
  const overlays=new Map(documents.map(d=>[normalize(d.file),d])),sources={},seen=new Set();let bytes=0;
  async function visit(name,disk){
    if(seen.has(name))return;seen.add(name);if(seen.size>64)throw Error('Projeto excede 64 arquivos.');
    const open=overlays.get(normalize(disk));let source,revision;
    if(open){source=open.source;revision=open.revision;}else{const data=await fs.promises.readFile(disk);source=new TextDecoder('utf-8',{fatal:true}).decode(data);revision=require('node:crypto').createHash('sha256').update(data).digest('hex');}
    bytes+=Buffer.byteLength(source);if(bytes>4*1024*1024)throw Error('Projeto excede 4 MiB de fontes.');
    sources[name]={source,revision};
    for(const imported of discoverImports(source,name)){
      const target=resolve(imported.specifier,name,imported.location),file=target.startsWith('tom/')?path.join(root,'tom-lang/stdlib',target.slice(4)+'.tom'):target;
      // Missing imports belong in semantic diagnostics, not an unhandled IO error.
      try{await visit(target,file);}catch(e){if(e.code!=='ENOENT')throw e;}
    }
  }
  entry=normalize(path.resolve(entry));await visit(entry,entry);return{entry,sources};
}
module.exports={collectProject};
