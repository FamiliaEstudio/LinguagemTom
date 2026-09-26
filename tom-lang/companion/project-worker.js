'use strict';
const {analyzeProject}=require('../core/project-analysis');
const {projectView}=require('./graph-model');
const {createHash}=require('node:crypto');
const {readDocument}=require('../core/recovery');
class ProjectAnalyzer {
  constructor(){this.previous=null;this.signature=null;this.revisions=new Map();this.expanded=[];this.filter=0;this.parseCache=new Map();this.commandCache=new Map();}
  analyze(input){
    const signature=createHash('sha256').update(JSON.stringify(input)).digest('hex');
    if(signature!==this.signature){
      const sources=input.sources||{},names=new Set(Object.keys(sources));
      if(names.size>64||Object.values(sources).reduce((n,v)=>n+Buffer.byteLength(typeof v==='string'?v:v.source),0)>4*1024*1024)throw Error('Projeto excede o orçamento de fontes.');
      for(const name of this.parseCache.keys())if(!names.has(name))this.parseCache.delete(name);
      for(const [file,value] of Object.entries(sources)){const source=typeof value==='string'?value:value.source;if(this.parseCache.get(file)?.source!==source)this.parseCache.set(file,{source,document:readDocument(source,file,{commands:this.commandCache})});}
      const candidate=analyzeProject(input,{previous:this.previous,parseCache:this.parseCache});if(candidate.diagnostics.some(d=>d.code==='E_PROJECT_LIMIT'))throw Error(candidate.diagnostics[0].message);
      this.previous=candidate;this.signature=signature;this.revisions=new Map(this.previous.files.map(f=>[f.file,f.revision]));
      const ids=new Set(candidate.nodes.map(n=>n.id));this.expanded=this.expanded.filter(id=>ids.has(id));
    }
    return this.view();
  }
  view(){if(!this.previous)throw Error('Projeto ainda não analisado.');return projectView(this.previous,{expanded:this.expanded,filter:this.filter});}
  expand(id){const previous=[...this.expanded],index=this.expanded.indexOf(id);if(index<0)this.expanded.push(id);else this.expanded.splice(index,1);try{return this.view();}catch(error){this.expanded=previous;throw error;}}
}
if(require.main===module){
  const analyzer=new ProjectAnalyzer();let buffer='';process.stdin.setEncoding('utf8');
  process.stdin.on('data',data=>{buffer+=data;if(Buffer.byteLength(buffer)>32*1024*1024){process.stderr.write('Limite de entrada do analisador excedido.\n');process.exitCode=1;process.stdin.destroy();return;}
    let end;while((end=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,end);buffer=buffer.slice(end+1);let request;
      try{request=JSON.parse(line);let result;if(request.op==='analyze')result=analyzer.analyze(request.input);else if(request.op==='expand')result=analyzer.expand(request.target);else if(request.op==='filter'){analyzer.filter=request.filter;result=analyzer.view();}else throw Error('Operação desconhecida.');process.stdout.write(JSON.stringify({id:request.id,revision:request.revision,result})+'\n');}
      catch(e){process.stdout.write(JSON.stringify({id:request?.id,revision:request?.revision,error:e.message})+'\n');}
    }
  });
}
module.exports={ProjectAnalyzer};
