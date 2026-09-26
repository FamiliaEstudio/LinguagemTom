'use strict';
// Source semantics, independent of LLVM, native tools, files and execution.
const { fail, CompilationError, decodeString } = require('./source');
const { typeOf, literal, sameType } = require('./types');
const { builtins } = require('./builtins');
const { resources } = require('./resources');
const { resolveTypes } = require('./nominal-types');
const returns = body => body.some(n=>['return','rethrow'].includes(n.kind)||
  (n.kind==='if'&&returns(n.body)&&returns(n.otherwise))||(n.kind==='try'&&returns(n.body)&&returns(n.handler))||
  (n.kind==='scope'&&!n.body.some(x=>x.kind==='guard')&&returns(n.body)));

function checkProgram(ast, { recover=false, observer={} }={}) {
  const diagnostics=[], bindings=new WeakMap(), functions=new Map(), global=new Map();
  let types=new Map();
  function attempt(action,node){try{return action();}catch(error){if(!(error instanceof CompilationError))throw error;if(!recover)throw error;diagnostics.push(error.diagnostic);observer.invalid?.(node,error.diagnostic);return null;}}
  attempt(()=>{types=resolveTypes(ast,recover?(error,node)=>{diagnostics.push(error.diagnostic);observer.invalid?.(node,error.diagnostic);}:null);},ast);
  const resolved=name=>types.get(name)||typeOf(name);
  const notify=(name,...args)=>observer[name]?.(...args);
  class Scope {
    constructor(symbols=global,fn=null,depth=0,loops=0,catches=0){this.symbols=new Map(symbols);this.fn=fn;this.depth=depth;this.loops=loops;this.catches=catches;this.last={numeric:null,text:null};}
    invalidate(){this.last={numeric:null,text:null};}
    define(name,value,node,parameter){
      if(['ULTIMO','TomPerf_StressLevel'].includes(name))fail('E_NAME',`'${name}' é reservado.`,node.location);
      if(this.symbols.has(name)){if(recover){const old=this.symbols.get(name);notify('invalid',old.node);this.symbols.set(name,{...old,ambiguous:true});}fail('E_DUPLICATE',`'${name}' já foi definido.`,node.location);}
      const symbol={mutable:true,...value,name,node,fn:this.fn,parameter};this.symbols.set(name,symbol);notify('define',symbol,node,parameter);return symbol;
    }
    lookup(name,node,access='read',expectedKind){
      let symbol=this.symbols.get(name),fields=[];
      if(name.includes('.')&&this.symbols.get(name.split('.')[0])?.ambiguous)symbol=null;
      if(!symbol&&name.includes('.')){
        const [root,...path]=name.split('.');symbol=this.symbols.get(root);fields=path;
        if(symbol){let type=symbol.type;for(const field of path){if(type?.kind!=='record')fail('E_TYPE',`'${root}' não contém campos de registro.`,node.location);
          const prop=resolved(type.name).properties?.find(p=>p.name===field);if(!prop)fail('E_PROPERTY',`Campo '${field}' não existe em ${type.name}.`,node.location);type=prop.type;}
          symbol={...symbol,type};}
      }
      if(!symbol||symbol.ambiguous){notify('unresolved',name,node,access);fail('E_UNDEFINED',`'${name}' não foi definido neste escopo.`,node.location);}
      if(expectedKind&&symbol.kind!==expectedKind)fail('E_TYPE',`'${name}' não é ${expectedKind}.`,node.location);
      notify('use',symbol,name,node,access,fields);return symbol;
    }
    array(raw,node,access='read'){
      const m=/^([A-Za-z_][A-Za-z0-9_]*)@(@?[A-Za-z_][A-Za-z0-9_.]*|-?\d+)\.([A-Za-z_][A-Za-z0-9_]*)$/.exec(raw);if(!m)return null;
      const array=this.lookup(m[1],node,access,'array'),prop=array.properties.find(p=>p.name===m[3]);
      if(!prop)fail('E_PROPERTY',`Propriedade '${m[3]}' não existe em '${m[1]}'.`,node.location);
      if(m[2].startsWith('@')){const index=this.lookup(m[2].slice(1),node,'read','numeric');if(index.type.kind!=='int')fail('E_TYPE','Índice SOA deve ser inteiro.',node.location);}
      else{const index=BigInt(m[2]);if(index<0n||(array.count!==undefined&&index>=array.count))fail('E_BOUNDS','Índice SOA fora do limite.',node.location);}
      notify('field',array,m[3],node,access);return {...array,type:prop.type,kind:'numeric',constantValue:undefined};
    }
    lastUse(channel,node,type){
      const result=this.last[channel];notify('last',node,result,channel);
      if(!result)fail('E_ULTIMO',channel==='text'?'GerarTxtUltimo sem texto garantido.':'@ULTIMO sem resultado garantido neste bloco; use uma variável explícita.',node.location);
      if(type)sameType(result.type,type,node.location);return result;
    }
    produce(type,node,channel='numeric',value={}){const result={...value,type,node};this.last[channel]=result;notify('produce',node,result,channel);return result;}
    operand(raw,type,node){
      if(['record','enum'].includes(type.kind)&&!types.has(type.name))fail('E_TYPE',`Tipo '${type.name}' não foi declarado.`,node.location);
      if(raw==='@ULTIMO')return this.lastUse('numeric',node,type);
      if(raw==='Padrao'&&type.kind==='record')return {type};
      const array=this.array(raw,node);if(array){sameType(array.type,type,node.location);return{type};}
      if(raw?.startsWith('@')){const s=this.lookup(raw.slice(1),node,'read','numeric');sameType(s.type,type,node.location);return s.constantValue||{type};}
      return literal(raw,type,node.location);
    }
    text(raw,node,access='read'){
      if(raw?.startsWith("l'")){const m=/^l'((?:\\.|[^'\\])*)'$/.exec(raw);if(!m)fail('E_LITERAL','Literal de texto inválido.',node.location);decodeString(m[1],node.location);return;}
      if(raw==='@ULTIMO')return this.lastUse('text',node);
      if(!raw?.startsWith('@'))fail('E_ARGUMENT','Texto exige literal ou @nome.',node.location);
      const s=this.lookup(raw.slice(1),node,access);
      if(!['buffer','text','textview'].includes(s.kind)&&s.type?.name!=='Texto')fail('E_TYPE','Esperado texto ou buffer.',node.location);return s;
    }
    argument(raw,expected,node,mutable=false,access='read'){
      mutable ||= expected.startsWith('Ref');expected=expected.replace(/^Ref/,'');
      if(expected==='Txt')return this.text(raw,node,access);
      if(expected==='Buffer'||/^FB\d+C$/.test(expected)||resources[expected]||expected.startsWith('SOA<')||(expected.startsWith('Registro<')&&mutable)){
        if(!raw.startsWith('@')||raw==='@ULTIMO')fail('E_ARGUMENT','Recurso ou referência exige @nome explícito.',node.location);
        const s=this.lookup(raw.slice(1),node,access);
        const ok=expected==='Buffer'?(s.kind==='buffer'||s.type?.name==='Texto'):expected.startsWith('SOA<')?s.kind==='array'&&`SOA<${s.struct}>`===expected:s.type?.name===expected;
        if(!ok)fail('E_TYPE',`Esperado ${expected}.`,node.location);
        if(mutable&&s.mutable===false)fail('E_BORROW','Parâmetro somente leitura; declare Ref para alterá-lo.',node.location);return s;
      }
      return this.operand(raw,resolved(expected),node);
    }
    writable(s,node){if(s.immutable)fail('E_CONSTANT','Não é permitido alterar uma constante.',node.location);if(s.mutable===false)fail('E_BORROW','Referência somente leitura.',node.location);}
    block(body,{loop=false,catchNode=null,errorName=null,initialize}={}){
      const child=new Scope(this.symbols,this.fn,this.depth+1,this.loops+Number(loop),this.catches+Number(!!catchNode));
      if(errorName)child.define(errorName,{kind:'error'},catchNode);
      initialize?.(child);child.walk(body);this.invalidate();return child;
    }
    walk(body){let terminated=false;for(const node of body){
      if(terminated&&node.kind!=='incomplete'){attempt(()=>fail('E_UNREACHABLE','Comando após saída incondicional.',node.location),node);continue;}
      const ok=attempt(()=>{this.visit(node);return true;},node);if(!ok)this.invalidate();
      if(ok&&['return','break','continue','rethrow'].includes(node.kind))terminated=true;
    }}
    visit(node){
      bindings.set(node,{scope:this,fn:this.fn});const loc=node.location,t=node.type;
      switch(node.kind){
        case 'incomplete':if(node.body)this.block(node.body);this.invalidate();return;
        case 'import':case 'function':case 'property':case 'enumItem':return;
        case 'record':this.define(node.name,{kind:'recordType'},node);return;
        case 'enum':{
          this.define(node.name,{kind:'enumType'},node);const type=resolved(`Enum<${node.name}>`);
          node.properties.forEach((p,i)=>this.define(`${node.name}.${p.name}`,{kind:'numeric',type,immutable:true,mutable:false,constantValue:{type,constant:BigInt(i)}},p));return;
        }
        case 'struct':if(!node.properties.length)fail('E_STRUCT','Struct SOA deve conter propriedades.',loc);this.define(node.name,{kind:'struct',properties:node.properties},node);return;
        case 'constant':case 'declare':{
          const value=this.operand(node.operand,t,node);
          if(node.kind==='constant'&&value.constant===undefined)fail('E_CONSTANT','Constante exige literal ou outra constante.',loc);
          this.define(node.name,{kind:'numeric',type:t,immutable:node.kind==='constant',mutable:node.kind!=='constant',...(node.kind==='constant'?{constantValue:value}:{})},node);return;
        }
        case 'set':case 'read':{
          const value=node.kind==='set'?this.operand(node.operand,t,node):null;
          const s=this.array(node.name,node,'write')||this.lookup(node.name,node,'write','numeric');this.writable(s,node);sameType(s.type,t,loc);
          if(value)this.produce(t,node,'numeric',value);return;
        }
        case 'math':{
          const a=this.operand(node.left,t,node),b=this.operand(node.right,t,node);let value={};
          if(t.kind==='int'){
            if(node.op==='Divid'&&b.constant===0n)fail('E_DIVISION','Divisão inteira por zero.',loc);
            if(a.constant!==undefined&&b.constant!==undefined){const x=a.constant,y=b.constant;const result=({Somar:()=>x+y,Subtr:()=>x-y,Multi:()=>x*y,Divid:()=>x/y})[node.op]();
              if(result<t.min||result>t.max)fail('E_OVERFLOW',`Overflow em ${t.name}.`,loc);value={constant:result};}
          }
          if(t.kind==='decimal'&&a.constant&&b.constant)value={constant:require('./decimal').calculate(node.op,a.constant,b.constant,loc)};
          this.produce(t,node,'numeric',value);return;
        }
        case 'compare':
          if(t.kind==='record'||(t.kind==='enum'&&!['Igual','Diferente'].includes(node.op)))fail('E_TYPE','Enum aceita apenas igualdade/desigualdade; compare os campos de registros explicitamente.',loc);
          this.operand(node.left,t,node);this.operand(node.right,t,node);this.produce(typeOf('Bl'),node);return;
        case 'boolean':this.operand(node.left,typeOf('Bl'),node);if(node.right)this.operand(node.right,typeOf('Bl'),node);this.produce(typeOf('Bl'),node);return;
        case 'bufferDeclare':{
          const capacity=BigInt(node.capacity);if(capacity<=0n||BigInt(Buffer.byteLength(node.text))+1n>capacity)fail('E_CAPACITY',`Texto excede a capacidade FB${capacity}, incluindo o terminador NUL.`,loc);
          if(capacity>0x7fffffffn)fail('E_CAPACITY','Buffer excede a capacidade suportada de 2147483647 bytes.',loc);
          this.define(node.name,{kind:'buffer',type:typeOf(`FB${capacity}C`)},node);this.produce(typeOf('Txt'),node,'text');return;
        }
        case 'bufferAppend':{
          const s=this.lookup(node.name,node,'readwrite','buffer');this.writable(s,node);if(s.type.capacity!==BigInt(node.capacity))fail('E_CAPACITY','Capacidade diferente da declaração do buffer.',loc);
          this.produce(typeOf('Txt'),node,'text');return;
        }
        case 'textDeclare':this.define(node.name,{kind:'text',type:typeOf('Txt')},node);return;
        case 'textSet':case 'textAppend':if(this.depth||this.fn)fail('E_TEXT_FLOW','Texto estático só pode ser alterado no nível superior; use FBnC em execução.',loc);this.lookup(node.name,node,node.kind==='textSet'?'write':'readwrite','text');return;
        case 'concat':if(node.mode.startsWith('FB')){const capacity=BigInt(node.mode.match(/\d+/)[0]);if(capacity<=0n||BigInt(Buffer.byteLength(node.text))+1n>capacity)fail('E_CAPACITY',`Texto excede a capacidade FB${capacity}, incluindo o terminador NUL.`,loc);}this.produce(typeOf('Txt'),node,'text');return;
        case 'print':return;
        case 'printName':this.text('@'+node.name,node);return;
        case 'printLast':this.lastUse('text',node);return;
        case 'array':{
          const s=this.lookup(node.struct,node,'type','struct'),count=BigInt(node.count);if(count<=0n||count>2147483647n)fail('E_RANGE','Quantidade SOA deve estar entre 1 e 2147483647.',loc);
          this.define(node.name,{kind:'array',struct:node.struct,type:typeOf(`SOA<${node.struct}>`),properties:s.properties,count},node);return;
        }
        case 'arrayLength':this.lookup(node.name,node,'read','array');this.produce(typeOf('InSd64'),node);return;
        case 'get':{const value=this.array(node.access,node);this.produce(value.type,node);return;}
        case 'each':{const s=this.lookup(node.name,node,'readwrite','array');this.writable(s,node);
          const candidates=s.properties.filter(p=>node.operation.startsWith(p.name)&&/^-?\d+$/.test(node.operation.slice(p.name.length)));
          if(!candidates.length)fail('E_PROPERTY','ParaCadaSOA exige uma propriedade existente seguida de incremento inteiro.',loc);
          if(candidates.length>1)fail('E_AMBIGUOUS','Propriedade e incremento ambíguos em ParaCadaSOA; use nomes de propriedades sem sufixos numéricos conflitantes.',loc);
          const p=candidates[0];if(p.type.kind!=='int')fail('E_EXPERIMENTAL','ParaCadaSOA com float é experimental.',loc);literal(node.operation.slice(p.name.length),p.type,loc);this.last.numeric=null;return;}
        case 'vector':{
          if(node.left.length!==4||node.right.length!==4)fail('E_VECTOR','Vec4 exige quatro elementos em cada operando.',loc);
          for(let i=0;i<4;i++){const a=literal(node.left[i],t,loc).constant,b=literal(node.right[i],t,loc).constant;if(node.op==='Divid'&&b===0n)fail('E_DIVISION','Divisão inteira por zero.',loc);const v=({Somar:()=>a+b,Subtr:()=>a-b,Multi:()=>a*b,Divid:()=>a/b})[node.op]();if(v<t.min||v>t.max)fail('E_OVERFLOW',`Overflow em ${t.name}.`,loc);}return;}
        case 'scope':this.block(node.body);return;
        case 'if':attempt(()=>this.operand(node.condition,typeOf('Bl'),node),node);this.block(node.body);this.block(node.otherwise);return;
        case 'while':this.invalidate();attempt(()=>this.operand(node.condition,typeOf('Bl'),node),node);this.block(node.body,{loop:true});return;
        case 'for':{
          if(node.array)this.lookup(node.array,node,'read','array');else{const values=node.args.map(x=>this.operand(x,typeOf('InSd64'),node));if(values[2].constant===0n)fail('E_LOOP_STEP','Passo de Para não pode ser zero.',loc);}
          this.block(node.body,{loop:true,initialize:s=>s.define(node.name,{kind:'numeric',type:typeOf('InSd64'),immutable:true,mutable:false},node)});return;
        }
        case 'try':this.block(node.body);this.block(node.handler,{errorName:node.errorName,catchNode:node.catchNode||node});return;
        case 'rethrow':if(!this.catches)fail('E_CATCH','Relancar exige Capturar.',loc);return;
        case 'errorField':this.lookup(node.name,node,'read','error');this.produce(typeOf(['Mensagem','Arquivo'].includes(node.field)?'Txt':'InSd32'),node,['Mensagem','Arquivo'].includes(node.field)?'text':'numeric');return;
        case 'break':case 'continue':if(!this.loops)fail('E_LOOP','Comando exige Enquanto ou Para.',loc);return;
        case 'guard':if(!this.depth)fail('E_SCOPE','SeMaior exige um escopo explícito.',loc);this.operand(node.left,t,node);this.operand(node.right,t,node);this.invalidate();return;
        case 'defer':if(!this.depth&&!this.fn)fail('E_DEFER','Defer exige um escopo.',loc);{const child=new Scope(this.symbols,this.fn,this.depth,this.loops,this.catches);child.visit(node.child);}return;
        case 'builtin':case 'resource':{
          const name=node.builtin||node.name,d=builtins[name];
          if(node.args.length!==d.args.length)fail('E_ARGUMENT',`${name} exige ${d.args.length} argumentos.`,loc);
          for(const [name,layout] of Object.entries(d.recordLayout||{})){const actual=types.get(`Registro<${name}>`);if(!actual||JSON.stringify(actual.properties.map(p=>[p.name,p.type.name]))!==JSON.stringify(layout))fail('E_ABI',`A operação ${node.name} exige o registro ${name} declarado em tom/sessao.`,loc);}
          if(resources[d.result]&&node.kind!=='resource')fail('E_RESOURCE','Use DefRecurso para receber um recurso.',loc);
          node.args.forEach((x,i)=>this.argument(x,d.args[i],node,false,d.access?.[i]||'read'));
          notify('call',node,null,d);
          if(node.kind==='resource')this.define(node.name,{kind:'resource',type:typeOf(d.result)},node);
          else if(d.result!=='Vazio')this.produce(resolved(d.result),node);return;
        }
        case 'call':{
          const fn=functions.get(node.name);if(!fn){notify('call',node,null,null);fail('E_FUNCTION',`Função '${node.name}' não existe.`,loc);}
          if(node.args.length!==fn.params.length)fail('E_ARGUMENT',`Função '${node.name}' exige ${fn.params.length} argumentos.`,loc);
          node.args.forEach((x,i)=>this.argument(x,fn.params[i].type.name,node,fn.params[i].mutable,'argument'));
          notify('call',node,fn,null);this.invalidate();if(fn.result!=='Vazio')this.produce(resolved(fn.result),node);return;
        }
        case 'return':
          if(!this.fn)fail('E_RETURN','Retornar exige função.',loc);
          if(this.fn.result==='Vazio'){if(node.operand)fail('E_RETURN','Função Vazio não retorna valor.',loc);}
          else{if(!node.operand)fail('E_RETURN','Retorno exige valor.',loc);this.operand(node.operand,resolved(this.fn.result),node);}
          notify('return',node,this.fn);return;
        default:fail('E_SYNTAX',`Instrução sem semântica: ${node.kind}.`,loc);
      }
    }
  }
  const setup=new Scope();
  for(const node of [...ast.body.filter(n=>['enum','record','struct'].includes(n.kind)),...ast.body.filter(n=>n.kind==='constant')])attempt(()=>setup.visit(node),node);
  for(const [name,s] of setup.symbols)global.set(name,s);
  const functionNodes=ast.body.filter(n=>n.kind==='function'),ambiguousFunctions=new Set();
  for(const fn of functionNodes)attempt(()=>{if(functions.has(fn.name)||ambiguousFunctions.has(fn.name)){
    if(recover){notify('invalid',functions.get(fn.name)||fn);functions.delete(fn.name);ambiguousFunctions.add(fn.name);}
    fail('E_DUPLICATE',`Função '${fn.name}' duplicada.`,fn.location);
  }functions.set(fn.name,fn);},fn);
  const visited=new Set(),active=new Set();
  function visitCalls(fn){if(active.has(fn))fail('E_RECURSION','Recursão não é suportada.',fn.location);if(visited.has(fn))return;active.add(fn);
    const walk=n=>{if(n.kind==='call'&&functions.has(n.name))visitCalls(functions.get(n.name));for(const key of ['body','otherwise','handler'])for(const c of n[key]||[])walk(c);if(n.child)walk(n.child);};walk(fn);active.delete(fn);visited.add(fn);}
  for(const fn of functions.values())attempt(()=>visitCalls(fn),fn);
  for(const fn of functionNodes){
    const scope=new Scope(global,fn);
    fn.params.forEach((p,index)=>attempt(()=>{
      const kind={buffer:'buffer',resource:'resource',textview:'textview',soa:'array'}[p.type.kind]||'numeric';
      let properties;if(kind==='array')properties=scope.lookup(p.type.struct,fn,'type','struct').properties;
      scope.define(p.name,{kind,type:p.type,mutable:kind==='numeric'?true:p.mutable,...(properties?{struct:p.type.struct,properties}:{})},fn,{...p,index});
    },fn));
    scope.walk(fn.body);
    if(fn.result!=='Vazio'&&!returns(fn.body))attempt(()=>fail('E_RETURN',`Função '${fn.name}' pode terminar sem retornar.`,fn.location),fn);
  }
  new Scope().walk(ast.body.filter(n=>!['function','struct','record','enum','constant'].includes(n.kind)));
  return {ast,types,functions,bindings,diagnostics,valid:diagnostics.length===0};
}
module.exports={checkProgram};
