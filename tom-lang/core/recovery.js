'use strict';
// Editor recovery uses the compiler's reader and command grammar. It never
// repairs a token into executable syntax. All offsets and columns are UTF-16.
const { readSource, CompilationError } = require('./source');
const { command } = require('./parser');
const opens = new Set(['function','if','while','for','scope','try','struct','record','enum']);
const closes = {endFunction:['function'],endIf:['if'],endWhile:['while'],endFor:['for'],endScope:['scope'],endTry:['try'],endStruct:['struct','record','enum']};
const cacheable=new Set(['declare','constant','set','math','compare','boolean','return','call','builtin','print','printName','bufferDeclare','arrayLength']);
function readDocument(source, file, {commands}={}) {
  const root={kind:'program',body:[]}, stack=[{node:root,branch:'body'}], instructions=[], diagnostics=[];
  let offset=0;
  const diagnostic=(code,message,node)=>{const d={code,message,severity:'error',...node.location};diagnostics.push(d);return d;};
  const append=node=>{const frame=stack.at(-1);node.parent=frame.node;node.branch=frame.branch;(frame.node[frame.branch] ||= []).push(node);};
  const rows=source.split('\n');
  rows.forEach((raw,line)=>{
    const row=raw.endsWith('\r')?raw.slice(0,-1):raw;
    let statement,node;
    try {statement=readSource(row,file)[0];if(!statement){offset+=raw.length+1;return;}
      statement.location.line=line+1;if(line===0&&raw.startsWith('\uFEFF'))statement.location.column++;
      const cached=commands?.get(statement.text);
      if(cached){node=structuredClone(cached);node.location=statement.location;}
      else{node=command(statement);if(commands&&cacheable.has(node.kind)&&statement.text.length<=4096){
        const bytes=Buffer.byteLength(statement.text);commands.bytes||=0;
        while(commands.size&&(commands.size>=8192||commands.bytes+bytes>2097152)){const oldest=commands.keys().next().value;commands.bytes-=Buffer.byteLength(oldest);commands.delete(oldest);}
        commands.set(statement.text,structuredClone(node));
        commands.bytes+=bytes;
      }}
    }
    catch(error){if(!(error instanceof CompilationError))throw error;
      const column=Math.max(0,row.search(/\S/));
      node={kind:'incomplete',location:{file,line:line+1,column:column+1},status:'incomplete'};
      statement={text:row.slice(column),location:node.location};
      node.diagnostic={...error.diagnostic,...node.location};diagnostics.push(node.diagnostic);
      const boundaries=[[/^DefFuncaox/,'function'],[/^Sex/,'if'],[/^Enquantox/,'while'],[/^(?:Parax|ParaIndiceSOAx)/,'for'],[/^EscopoInix/,'scope']];
      node.recoveryKind=boundaries.find(([pattern])=>pattern.test(statement.text))?.[1];
      if(node.recoveryKind){node.body=[];node.otherwise=[];}
    }
    node.status ||= 'confirmed';node.sourceText=statement.text;
    const start=offset+node.location.column-1,end=start+statement.text.length;
    node.range={file,start:{line,character:node.location.column-1,offset:start},end:{line,character:node.location.column-1+statement.text.length,offset:end}};
    instructions.push(node);offset+=raw.length+1;
    if(closes[node.kind]){
      let index=stack.length-1;
      while(index>0&&!closes[node.kind].includes(stack[index].node.recoveryKind||stack[index].node.kind))index--;
      if(!index){node.status='unresolved';diagnostic('E_SCOPE','Fechamento de bloco incompatível.',node);node.parent=stack.at(-1).node;return;}
      while(stack.length-1>index){const abandoned=stack.pop().node;abandoned.status='incomplete';diagnostic('E_UNCLOSED','Bloco sem fechamento.',abandoned);}
      const opened=stack.pop().node;node.parent=opened.parent;node.opens=opened;opened.closer=node;
      if(node.kind==='endScope'&&node.name!==opened.name){node.status='unresolved';diagnostic('E_SCOPE',`EscopoFimx${node.name} não corresponde ao escopo aberto.`,node);}
      if(opened.kind==='try'&&!opened.errorName)diagnostic('E_SCOPE','Tentar exige Capturar.',opened);
      return;
    }
    if(node.kind==='else'||node.kind==='catch'){
      const frame=stack.at(-1),expected=node.kind==='else'?'if':'try';node.parent=frame.node;
      if(frame.node.kind!==expected||frame.branch!=='body'){node.status='unresolved';diagnostic('E_SCOPE','Separador sem bloco correspondente.',node);return;}
      frame.branch=node.kind==='else'?'otherwise':'handler';node.opens=frame.node;
      if(node.kind==='catch'){frame.node.errorName=node.name;frame.node.catchNode=node;}
      return;
    }
    // A complete top-level declaration is a synchronization point after an
    // unfinished function. Do not swallow the rest of the file into that body.
    if(['function','record','enum','import'].includes(node.kind)&&stack.length>1){
      for(const frame of stack.slice(1)){frame.node.status='incomplete';diagnostic('E_UNCLOSED','Bloco sem fechamento antes da declaração.',frame.node);}stack.length=1;
    }
    const parent=stack.at(-1).node;
    if(['struct','record','enum'].includes(parent.kind)){
      node.parent=parent;
      if(node.kind===(parent.kind==='enum'?'enumItem':'property'))parent.properties.push(node);
      else{node.status='unresolved';diagnostic('E_STRUCT','Membro de tipo inválido; esperado Prop, Item ou FimDef.',node);}
      return;
    }
    append(node);
    if(opens.has(node.kind)||node.recoveryKind)stack.push({node,branch:'body'});
  });
  for(const {node} of stack.slice(1)){node.status='incomplete';diagnostic('E_UNCLOSED',`Bloco '${node.name}' sem fechamento.`,node);}
  return {file,source,root,instructions,diagnostics};
}
// Tokens are positional aids, not a second parser. A whole quoted literal is
// opaque, including escaped quotes and text that resembles Tom commands.
function tokenRanges(node){
  const text=node.sourceText,tokens=[];const re=/l'(?:\\.|[^'\\])*'?|@[A-Za-z_][A-Za-z_0-9.]*(?:@[A-Za-z_0-9.-]+)?|[^\s,\[\]]+/g;
  for(const match of text.matchAll(re))tokens.push({text:match[0],range:subrange(node,match.index,match.index+match[0].length)});
  return tokens;
}
function subrange(node,start,end){const p=node.range.start;return{file:node.range.file,start:{line:p.line,character:p.character+start,offset:p.offset+start},end:{line:p.line,character:p.character+end,offset:p.offset+end}};}
function discoverImports(source,file){
  const imports=[];let offset=0;
  // Discovery does not need to parse every function body a second time. The
  // actual Importar command still goes through the same reader and grammar.
  source.split('\n').forEach((raw,line)=>{
    if(raw.trimStart().startsWith('Importar'))try{
      const statement=readSource(raw,file)[0];if(statement){statement.location.line=line+1;const node=command(statement);
        if(node.kind==='import'){const character=statement.location.column-1;imports.push({specifier:node.specifier,location:node.location,range:{file,start:{line,character,offset:offset+character},end:{line,character:character+statement.text.length,offset:offset+character+statement.text.length}}});}}
    }catch(error){if(!(error instanceof CompilationError))throw error;}
    offset+=raw.length+1;
  });return imports;
}
module.exports={readDocument,discoverImports,tokenRanges,subrange,opens,closes};
