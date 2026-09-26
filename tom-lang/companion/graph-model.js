'use strict';
// Projection and wire encoding only: the Tom library owns positions and layout.
const {createHash}=require('node:crypto');
const categories={module:1,function:2,parameter:3,variable:4,buffer:4,text:4,resource:4,array:4,record:5,enum:5,struct:5,type:5,instruction:6,result:7,operation:8};
const relationNames=['contains','declares','calls','reads','writes','argument','receivesArgument','returns','produces','consumes','usesType','imports','readsField','writesField'];
const numberId=id=>Number(BigInt('0x'+createHash('sha256').update(id).digest('hex').slice(0,13)))+1;
function projectView(model,{expanded=[],filter=0,nodes=512,edges=2048}={}){
  const byId=new Map(model.nodes.map(n=>[n.id,n])),expand=new Set(expanded),visible=new Map(),adjacent=new Map();
  for(const e of model.edges)for(const id of [e.from,e.to]){if(!adjacent.has(id))adjacent.set(id,[]);adjacent.get(id).push(e);}
  function owner(n){let p=n;const visited=new Set();while(p&&!visited.has(p.id)){if(expand.has(p.id))return true;visited.add(p.id);p=byId.get(p.parent);}return false;}
  for(const n of model.nodes){if(['module','function'].includes(n.kind)||owner(n)){if(!filter||categories[n.kind]===filter||['module','function'].includes(n.kind))visible.set(n.id,n);}}
  for(const e of model.edges){const from=visible.get(e.from),to=byId.get(e.to);if(from&&owner(from)&&to&&['type','operation','record','enum','struct'].includes(to.kind)&&(!filter||categories[to.kind]===filter))visible.set(to.id,to);}
  if(visible.size>nodes)throw Error(`Vista excede ${nodes} nós. Recolha uma função ou aplique um filtro; a última vista foi preservada.`);
  const used=new Map(),numeric=id=>{const n=numberId(id);if(used.has(n)&&used.get(n)!==id)throw Error('Colisão de identificadores do mapa.');used.set(n,id);return n;};
  const ancestor=id=>{const seen=new Set();while(id&&!visible.has(id)&&!seen.has(id)){seen.add(id);id=byId.get(id)?.parent;}return visible.has(id)?id:null;};
  const relations=new Map();
  for(const e of model.edges){const from=ancestor(e.from),to=ancestor(e.to);if(!from||!to||from===to)continue;const id=[e.kind,from,to].join('|');if(!relations.has(id))relations.set(id,{id,from: numeric(from),to:numeric(to),category:relationNames.indexOf(e.kind)+1,state:e.status==='confirmed'?0:2});}
  if(relations.size>edges)throw Error(`Vista excede ${edges} arestas. Recolha elementos ou filtre relações; a última vista foi preservada.`);
  const locations={};
  const items=[...visible.values()].map(n=>{
    const id=numeric(n.id);
    const nominal=n.kind==='type'&&/^(?:Registro|Enum|SOA)<(.+)>$/.exec(n.name);
    const origin=nominal?model.nodes.find(t=>['record','enum','struct'].includes(t.kind)&&t.name===nominal[1]):n;
    if(origin?.range||n.kind==='module')locations[id]={id:n.id,file:origin?.range?.file||n.name,line:(origin?.range?.start.line??0)+1,column:(origin?.range?.start.character??0)+1};
    const kindNames={module:'Módulo',function:'Função',parameter:'Parâmetro',variable:'Variável',buffer:'Buffer',text:'Texto',resource:'Recurso',array:'Coleção SOA',instruction:'Instrução',type:'Tipo',record:'Registro',enum:'Enumeração',struct:'Estrutura SOA'};
    const words={contains:'Contém',declares:'Declara',calls:'Chama',reads:'Lê',writes:'Altera',argument:'Passa argumento',receivesArgument:'Recebe argumento',returns:'Retorna',produces:'Produz resultado',consumes:'Consome resultado',usesType:'Usa tipo',imports:'Importa',readsField:'Lê campo',writesField:'Altera campo'};
    const incoming={contains:'Pertence a',declares:'Declarado por',calls:'Chamado por',reads:'Lido por',writes:'Alterado por',argument:'Recebe argumento de',receivesArgument:'Recebe argumento na chamada',returns:'Retorno definido em',produces:'Produzido por',consumes:'Consome resultado de',usesType:'Usado por',imports:'Importado por',readsField:'Campo lido por',writesField:'Campo alterado por'};
    const relations=(adjacent.get(n.id)||[]).slice(0,20).map(e=>`${e.from===n.id?(e.kind==='consumes'?'Consumido por':words[e.kind]||e.kind):(incoming[e.kind]||e.kind)}: ${byId.get(e.from===n.id?e.to:e.from)?.name||'indisponível'}`);
    const prior=model.visualContext?.find(p=>p.id===n.id);
    const detail=[n.name,n.kind==='result'?'Resultado local desta instrução; não é uma variável global.':kindNames[n.kind]||n.kind,n.type?'Tipo: '+n.type:'',n.range?`${n.range.file}:${n.range.start.line+1}:${n.range.start.character+1}`:!locations[id]?'Elemento nativo, sem declaração em fonte Tom.':'',n.initializer?'Inicialização escrita: '+n.initializer.text:'',n.text||'',n.status==='confirmed'?'Análise estática confirmada.':n.status==='incomplete'?'Trecho ainda incompleto.':'Relação ainda não resolvida.',prior?'Contexto anterior, não confirmado:\n'+prior.previous.text:'',...relations].filter(Boolean).join('\n');
    const commands={declare:'Declarar',constant:'Constante',bufferDeclare:'Criar buffer',set:'Alterar',call:'Chamar',math:'Calcular',compare:'Comparar',return:'Retornar',if:'Se',while:'Enquanto',for:'Para',scope:'Escopo',try:'Tentar',print:'Imprimir',printName:'Imprimir',printLast:'Imprimir resultado',bufferAppend:'Anexar texto',defer:'Defer',incomplete:'Incompleto'};
    let label=n.kind==='module'?n.name.split(/[\\/]/).at(-1):n.kind==='instruction'?`${commands[n.instructionKind]||n.text?.split('[')[0]||'Instrução'}: ${n.name}`:n.name||n.kind;
    if(prior)label=(prior.previous.name||prior.previous.kind)+' ?';
    if(Array.from(label).length>20)label=Array.from(label).slice(0,19).join('')+'…';
    return{id,group:numeric(ancestor(n.parent)||'root'),category:categories[n.kind]||6,state:n.status==='confirmed'?0:n.status==='incomplete'?1:2,label,detail:Array.from(detail).slice(0,3000).join('')+(detail.length>3000?'\n(Trecho abreviado. Enter abre o fonte completo.)':''),expanded:expand.has(n.id)};
  });
  return{nodes:items,edges:[...relations.values()].map(e=>({...e,id:numeric(e.id)})),locations,revision:model.revision,complete:model.complete,success:model.success,diagnostics:model.diagnostics};
}
function blocks(view,limit=64*1024){
  const result=[];let block={nodes:[],edges:[]};
  for(const [kind,values] of [['nodes',view.nodes],['edges',view.edges]])for(const value of values){
    block[kind].push(value);
    if(Buffer.byteLength(JSON.stringify(block))>limit){block[kind].pop();if(!block.nodes.length&&!block.edges.length)throw Error('Um elemento excede o bloco de transporte.');result.push(block);block={nodes:[],edges:[]};block[kind].push(value);}
  }
  if(block.nodes.length||block.edges.length||!result.length)result.push(block);return result;
}
module.exports={projectView,blocks,numberId,relationNames};
