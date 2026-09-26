'use strict';
const { readDocument, subrange, tokenRanges } = require('./recovery');
const { normalize, resolve } = require('./modules');
const { checkProgram } = require('./semantic');
const { builtins } = require('./builtins');
const { CompilationError } = require('./source');

const DEFAULT_LIMITS=Object.freeze({files:64,sourceBytes:4*1024*1024});
const plain=value=>value===undefined?undefined:JSON.parse(JSON.stringify(value,(_,v)=>typeof v==='bigint'?v.toString():v));
const structural=node=>`${node.kind}|${node.type?.name||''}|${node.params?.map(p=>p.type.name).join(',')||''}|${node.result||''}`;
function identities(documents, previous, edits=[]){
  let next=previous?.nextId||1;
  const oldGroups=new Map();
  for(const n of previous?.instructions||[]){const key=n.parent+'|'+n.branch;if(!oldGroups.has(key))oldGroups.set(key,[]);oldGroups.get(key).push(n);}
  const group=(nodes,key)=>{const map=new Map();for(const n of nodes){const value=key(n);if(!map.has(value))map.set(value,[]);map.get(value).push(n);}return map;};
  for(const doc of documents){
    doc.root.id=`module:${doc.file}`;
    const batches=edits.filter(e=>normalize(e.file)===doc.file);
    let revision=previous?.files?.find(f=>f.file===doc.file)?.revision;
    const chain=batches.length&&batches.every(b=>{const ok=b.fromRevision===revision;revision=b.toRevision;return ok;})&&revision===doc.revision;
    if(chain){
      const positions=new Map();
      for(const old of previous.instructions.filter(n=>n.range?.file===doc.file)){
        let start=old.range.start.offset,end=old.range.end.offset,valid=true;
        for(const batch of batches)for(const change of [...batch.changes].sort((a,b)=>b.rangeOffset-a.rangeOffset)){
          const a=change.rangeOffset,b=a+change.rangeLength,delta=change.text.length-change.rangeLength;
          if(b<=start){start+=delta;end+=delta;}else if(a>=end){}else if(a>=start&&b<=end)end+=delta;else valid=false;
        }
        if(valid)positions.set(start+':'+end,old);
      }
      for(const n of doc.instructions){const old=positions.get(n.range.start.offset+':'+n.range.end.offset);if(old&&(old.kind===n.kind||n.kind==='incomplete'))n.id=old.id;}
    }
    const parents=group(doc.instructions,n=>n.parent||doc.root),queue=[doc.root];
    for(let q=0;q<queue.length;q++){
      const parent=queue[q],branches=group(parents.get(parent)||[],n=>n.branch||'body');
      for(const [branch,current] of branches){
        const old=oldGroups.get(parent.id+'|'+branch)||[],used=new Set(current.filter(n=>n.id).map(n=>n.id));
        const match=(currentKey,oldKey,duplicates=false)=>{
          const left=group(current.filter(n=>!n.id),currentKey),right=group(old.filter(n=>!used.has(n.id)),oldKey);
          for(const [key,items] of left){const candidates=right.get(key)||[];
            if(candidates.length===items.length&&(duplicates||items.length===1))items.forEach((n,i)=>{n.id=candidates[i].id;used.add(n.id);});
          }
        };
        match(n=>n.kind+'|'+n.sourceText,n=>n.kind+'|'+n.text,true);
        match(n=>n.name?n.kind+'|'+n.name:Symbol(),n=>n.name?n.kind+'|'+n.name:Symbol());
        match(structural,n=>n.shape);
        const remaining=old.filter(n=>!used.has(n.id));
        for(const n of current.filter(n=>!n.id&&n.kind==='incomplete')){
          const candidates=remaining.filter(p=>!used.has(p.id)&&n.sourceText.length>=4&&p.text.startsWith(n.sourceText));
          if(candidates.length===1){n.id=candidates[0].id;used.add(n.id);}
        }
        for(const n of current){n.id||=`n${next++}`;if(parents.has(n))queue.push(n);}
      }
    }
  }
  return next;
}
function ranges(node){
  const text=node.sourceText,result={instruction:node.range,tokens:tokenRanges(node),arguments:[]};
  let nameAt=-1;
  if(node.name){nameAt=text.indexOf('x'+node.name);if(nameAt>=0)nameAt++;else if(['builtin'].includes(node.kind))nameAt=0;}
  if(nameAt>=0)result.name=subrange(node,nameAt,nameAt+node.name.length);
  const commandEnd=node.kind==='builtin'?node.name.length:node.kind==='resource'?10:node.kind==='call'?6:node.kind==='function'?9:
    text.search(/(?:In(?:Sd|Ud)(?:32|64)|Fl(?:32|64)|Dc34|FB\d+|Bl|[xy\[])/);
  result.command=subrange(node,0,commandEnd>0?commandEnd:text.length);
  if(node.args||node.params){let start=text.indexOf('[')+1,quoted=false,escaped=false;
    for(let i=start;i<text.length;i++){const c=text[i];if(escaped){escaped=false;continue;}if(quoted&&c==='\\'){escaped=true;continue;}if(c==="'"){quoted=!quoted;continue;}
      if(!quoted&&(c===','||c===']')){let a=start,b=i;while(/\s/.test(text[a]||'')&&a<b)a++;while(/\s/.test(text[b-1]||'')&&b>a)b--;result.arguments.push(subrange(node,a,b));start=i+1;}}
  }else{
    let cursor=Math.max(0,nameAt>=0?nameAt+(node.name?.length||0)+1:node.type?text.indexOf(node.type.name)+node.type.name.length+1:0);
    for(const raw of [node.operand,node.left,node.right,node.condition])if(typeof raw==='string'){let at=text.indexOf(raw,cursor);if(at<0)at=text.indexOf(raw);if(at>=0){result.arguments.push(subrange(node,at,at+raw.length));cursor=at+raw.length;}}
  }
  return result;
}
function analyzeProject(input, options={}){
  const entry=normalize(input.entry||input.file||'<input>');
  const sources=new Map(Object.entries(input.sources||{...(input.modules||{}),[entry]:input.source||''}).map(([file,value])=>[normalize(file),typeof value==='string'?{source:value,revision:input.revisions?.[file]??0}:value]));
  const limits={...DEFAULT_LIMITS,...options.limits},diagnostics=[],documents=[],active=new Set(),visited=new Set(),importEdges=[];
  const result={version:2,entry,revision:input.revision??sources.get(entry)?.revision??0,files:[],instructions:[],nodes:[],edges:[],symbols:[],references:[],calls:[],lastResults:[],diagnostics,success:false,complete:false,nextId:options.previous?.nextId||1,limits};
  function issue(code,message,location={file:entry,line:1,column:1}){diagnostics.push({code,message,severity:'error',...location});}
  let bytes=0;
  function visit(file,location){
    if(active.has(file)){issue('E_IMPORT_CYCLE',`Ciclo de importação: ${file}.`,location);return;}
    if(visited.has(file))return;
    const value=sources.get(file);if(!value||typeof value.source!=='string'){issue('E_IMPORT_MISSING',`Fonte importado não fornecido: ${file}.`,location);return;}
    bytes+=Buffer.byteLength(value.source);if(visited.size>=limits.files||bytes>limits.sourceBytes){issue('E_PROJECT_LIMIT','Projeto excede o limite de arquivos ou bytes de fontes.',location);return;}
    visited.add(file);active.add(file);const cached=options.parseCache?.get(file);
    const doc=cached?.source===value.source?structuredClone(cached.document):readDocument(value.source,file);
    doc.revision=value.revision??0;documents.push(doc);diagnostics.push(...doc.diagnostics);
    for(const n of doc.instructions.filter(n=>n.kind==='import'))try{const target=resolve(n.specifier,file,n.location);importEdges.push({node:n,target});visit(target,n.location);}catch(e){if(!(e instanceof CompilationError))throw e;diagnostics.push(e.diagnostic);}
    active.delete(file);
  }
  visit(entry);
  if(diagnostics.some(d=>d.code==='E_PROJECT_LIMIT'))return result; // Never publish a truncated project as complete.
  result.nextId=identities(documents,options.previous,input.edits||[]);
  const byId=new Map(),edgeKeys=new Set(),symbolIds=new WeakMap(),uses=[],callBindings=[],usesByNode=new Map();
  function addNode(n){if(!byId.has(n.id)){byId.set(n.id,n);result.nodes.push(n);}return byId.get(n.id);}
  function edge(kind,from,to,extra={}){if(!from||!to)return;const id=[kind,from,to,extra.argument??'',extra.field??'',extra.call??''].join('|');if(edgeKeys.has(id))return;edgeKeys.add(id);result.edges.push({id,kind,from,to,status:'confirmed',...extra});}
  function instruction(n){if(!n.id&&n.location){const parent=documents.flatMap(d=>d.instructions).find(x=>x.location.file===n.location.file&&x.location.line===n.location.line);if(parent){n.id=parent.id;n.range=parent.range;}}return n.id;}
  for(const doc of documents){
    addNode({id:doc.root.id,kind:'module',name:doc.file,range:null,status:doc.diagnostics.length?'incomplete':'confirmed',parent:null});
    result.files.push({file:doc.file,revision:doc.revision,bytes:Buffer.byteLength(doc.source)});
    for(const n of doc.instructions){
      const owner=(()=>{let p=n;while(p&&p.kind!=='function')p=p.parent;return p?.name||null;})();
      const item={id:n.id,kind:n.kind,name:n.name||n.op||n.kind,text:n.sourceText,shape:structural(n),status:n.status,range:n.range,ranges:ranges(n),location:n.location,end:{line:n.range.end.line+1,column:n.range.end.character+1},parent:n.parent?.id||doc.root.id,branch:n.branch||'body',owner,recognized:n.kind!=='incomplete'};
      for(const key of ['op','operand','left','right','condition','args','builtin','field','capacity','count','struct','specifier','result'])if(n[key]!==undefined)item[key]=plain(n[key]);
      if(n.type)item.type=n.type.name;if(n.text!==undefined)item.literal=n.text;if(n.params)item.params=n.params.map(p=>({name:p.name,type:p.type.name,mutable:p.mutable}));if(n.opens)item.opens=n.opens.id;
      result.instructions.push(item);addNode({...item,kind:['function','record','enum','struct'].includes(n.kind)?n.kind:'instruction',instructionKind:n.kind});edge('contains',item.parent,n.id);
      if(n.type){const id=`type:${n.type.name}`;addNode({id,kind:'type',name:n.type.name,status:'confirmed',parent:null});edge('usesType',n.id,id);}
    }
  }
  for(const {node,target} of importEdges)edge('imports',node.parent.id,`module:${target}`,{status:visited.has(target)?'confirmed':'unresolved'});
  const ast={kind:'program',body:documents.slice().reverse().flatMap(d=>d.root.body.filter(n=>n.kind!=='import'))};
  for(const doc of documents.filter(d=>d.file!==entry))for(const n of doc.root.body)if(!['import','function','constant','struct','record','enum','incomplete'].includes(n.kind))issue('E_MODULE_INITIALIZER','Módulos só podem declarar funções, constantes e tipos.',n.location);
  const semantic=checkProgram(ast,{recover:true,observer:{
    invalid(n){const item=byId.get(instruction(n));if(item&&item.status==='confirmed')item.status='unresolved';},
    define(s,n,param){
      const id=`${instruction(n)}:${param?'p'+param.index:'declaration'}`,parent=param?n.id:n.parent?.id||`module:${n.location.file}`;
      const range=param?(()=>{const arg=byId.get(n.id)?.ranges.arguments[param.index];return arg?subrange(n,arg.end.offset-n.range.start.offset-param.name.length,arg.end.offset-n.range.start.offset):n.range;})():byId.get(n.id)?.ranges?.name||n.range;
      const symbol={id,kind:param?'parameter':s.kind==='numeric'?'variable':s.kind,name:s.name,type:s.type?.name||null,mutable:s.mutable,borrowed:!!param&&['buffer','resource','soa','record'].includes(s.type?.kind),permissionToMutate:!!param?.mutable,parent,location:n.location,range,status:'confirmed',owner:s.fn?.name||null};
      if(n.operand)symbol.initializer={kind:'source',text:n.operand};if(n.text!==undefined)symbol.initializer={kind:'source',text:n.text};
      symbolIds.set(s,id);result.symbols.push(symbol);addNode(symbol);edge('declares',n.id,id);
      if(param)edge('contains',n.id,id);
      if(s.type){const typeId=`type:${s.type.name}`;addNode({id:typeId,kind:'type',name:s.type.name,status:'confirmed',parent:null});edge('usesType',id,typeId);}
    },
    use(s,name,n,access,fields){const target=symbolIds.get(s)||`${s.node.id}:${s.parameter?'p'+s.parameter.index:'declaration'}`;
      const ref={instruction:instruction(n),name,target,location:n.location,access,write:['write','readwrite'].includes(access),fields,resolved:true};result.references.push(ref);const use={s,n,access,target,fields};uses.push(use);if(!usesByNode.has(n))usesByNode.set(n,[]);usesByNode.get(n).push(use);
      if(access!=='argument')for(const kind of access==='readwrite'?['reads','writes']:[access==='write'?'writes':access==='type'?'usesType':'reads'])edge(kind,n.id,target,{field:fields?.join('.')||undefined});
    },
    unresolved(name,n,access){result.references.push({instruction:instruction(n),name,target:null,location:n.location,access,write:access==='write',resolved:false});},
    field(s,field,n,access){edge(access==='write'?'writesField':'readsField',instruction(n),symbolIds.get(s),{field});},
    produce(n,value,channel){const id=`${instruction(n)}:result:${channel}`;addNode({id,kind:'result',name:'@ULTIMO',channel,type:value.type.name,parent:n.id,range:n.range,status:'confirmed'});edge('produces',n.id,id);},
    last(n,value,channel){result.lastResults.push({instruction:instruction(n),location:n.location,producer:value?.node.id||null,type:value?.type.name||null,channel,resolved:!!value});if(value)edge('consumes',`${value.node.id}:result:${channel}`,n.id);},
    call(n,fn,builtin){
      const target=fn?fn.id:builtin?`native:${n.builtin||n.name}`:null;if(builtin)addNode({id:target,kind:'operation',name:n.builtin||n.name,parent:null,status:'confirmed'});
      result.calls.push({instruction:instruction(n),from:byId.get(n.id)?.owner,name:n.builtin||n.name,target,location:n.location});if(target)edge('calls',n.id,target);callBindings.push({n,fn});
    },
    return(n,fn){edge('returns',instruction(n),fn.id);}
  }});
  diagnostics.push(...semantic.diagnostics);
  // Function effects form a fixed point over calls. Ref grants permission;
  // only body accesses (including transitive calls) establish an effect.
  const effects=new Map();
  const effect=(fn,index)=>{const key=fn.id+':p'+index;if(!effects.has(key))effects.set(key,new Set());return effects.get(key);};
  for(const u of uses)if(u.s.parameter&&u.access!=='argument')effect(u.s.fn,u.s.parameter.index).add(u.access);
  for(let pass=0;pass<=semantic.functions.size;pass++){let changed=false;
    for(const {n,fn} of callBindings.filter(x=>x.fn))n.args.forEach((raw,i)=>{
      const used=(usesByNode.get(n)||[]).filter(u=>u.access==='argument'&&('@'+u.s.name===raw||raw.startsWith('@'+u.s.name+'.')));
      edge('receivesArgument',n.id,`${fn.id}:p${i}`,{argument:i,source:raw});
      for(const u of used){const target=`${fn.id}:p${i}`;edge('argument',u.target,target,{argument:i,call:n.id});
        const set=effect(fn,i);for(const access of set){
          const writing=['write','readwrite'].includes(access)&&fn.params[i].mutable;
          if(access==='read'||access==='readwrite'||(!writing&&access==='write'))edge('reads',n.id,u.target);
          if(writing)edge('writes',n.id,u.target);
          if(u.s.parameter){const into=effect(u.s.fn,u.s.parameter.index),mapped=writing?access:'read';if(!into.has(mapped)){into.add(mapped);changed=true;}}
        }
      }
    });if(!changed)break;
  }
  for(const s of result.symbols)if(s.kind==='parameter')s.effects=[...(effects.get(s.id)||[])].sort();
  for(const n of result.instructions)n.status=byId.get(n.id).status;
  for(const s of result.symbols)if(byId.get(s.id.split(':')[0])?.status==='unresolved')s.status='unresolved';
  for(const e of result.edges)if([e.from,e.to].some(id=>byId.get(id)?.status==='unresolved'))e.status='unresolved';
  const unique=new Map(diagnostics.map(d=>[JSON.stringify(d),d]));result.diagnostics=[...unique.values()];result.success=result.diagnostics.length===0;result.complete=!result.diagnostics.some(d=>d.code.startsWith('E_IMPORT')||d.code==='E_PROJECT_LIMIT');
  // Old evidence is kept separately and never upgraded to a current relation.
  result.visualContext=[];
  if(options.previous)for(const n of result.instructions.filter(n=>n.status==='incomplete')){const old=options.previous.instructions.find(p=>p.id===n.id);if(old)result.visualContext.push({id:n.id,status:'stale',previous:old});}
  return result;
}
module.exports={analyzeProject,DEFAULT_LIMITS};
