/* Presentation only: Tom owns course decisions, graph layout, camera and interaction. */
(() => {
  'use strict';
  const vscode=acquireVsCodeApi(),kind=document.body.dataset.view;
  const main=document.getElementById('content'),message=document.getElementById('message'),start=document.getElementById('start'),close=document.getElementById('close');
  let state,connected=false,viewport,detail,nodesLayer,edgesLayer,resizeTimer,motionFrame,pendingMotion,lastSystemMotion;
  const nodes=new Map(),edges=new Map();
  const stored=vscode.getState()||{};
  const el=(name,text,parent,cls)=>{const e=document.createElement(name);if(text)e.textContent=text;if(cls)e.className=cls;parent?.append(e);return e;};
  const svg=(name,parent,attrs={})=>{const e=document.createElementNS('http://www.w3.org/2000/svg',name);for(const [k,v] of Object.entries(attrs))e.setAttribute(k,v);parent?.append(e);return e;};
  const post=value=>vscode.postMessage({...value,session:state?.session,revision:state?.revision,sequence:state?.sequence});
  start.onclick=()=>post({kind:'start'});close.onclick=()=>post({kind:'close'});
  const action=(parent,label,id)=>{const b=el('button',label,parent);b.dataset.action=id;b.onclick=()=>post({kind:'action',action:id});return b;};
  const input=value=>{if(connected)post({kind:'input',...value});};
  const resize=()=>{if(!viewport||!connected)return;const r=viewport.getBoundingClientRect();if(r.width&&r.height){const reduced=document.body.classList.contains('vscode-reduce-motion'),preference=reduced!==lastSystemMotion?{reduced}:{};lastSystemMotion=reduced;input({type:5,width:r.width,height:r.height,...preference});}};
  function companion(){
    const a=el('section',null,main,'card');el('h2',null,a).id='objective-title';
    el('pre',null,a,'prose').id='objective';
    const controls=el('div',null,a,'controls');for(const [text,id] of [['Pista',4],['Copiar código',29],['Ver passo',5],['Onde?',6],['Anterior',3],['Próximo',2]])action(controls,text,id);
    const b=el('section',null,main,'card');el('h2','Trecho selecionado',b);el('pre',null,b,'prose').id='explanation';
    el('p',null,b,'relation').id='relation';
    const nav=el('div',null,b,'controls');for(const [text,id] of [['Explicar',12],['Outra relação',27],['Ir ao código',28]])action(nav,text,id);
    const c=el('section',null,main,'card');el('h2','Verificação e resultados',c);el('pre',null,c,'prose').id='result';
    const run=el('div',null,c,'controls');for(const [text,id] of [['Verificar',1],['Executar',7],['Parar',8],['Empacotar',9],['Salvar',10],['Fonte',11]])action(run,text,id);
  }
  function map(){
    main.className='map';
    const toolbar=el('div',null,main,'controls');
    toolbar.append(close);
    const filter=el('select',null,toolbar);filter.setAttribute('aria-label','Categorias do mapa');
    for(const [i,name] of ['Todas as categorias','Módulos','Funções','Parâmetros','Variáveis','Tipos','Instruções','Resultados','Operações nativas'].entries()){const option=el('option',name,filter);option.value=i;}
    filter.onchange=()=>input({type:3,key:48+Number(filter.value)});
    for(const [label,key] of [['Expandir/recolher',32],['Ir ao código',13],['Fixar/soltar',112],['Movimento',109],['Sincronizar',114]]){const b=el('button',label,toolbar);b.dataset.key=key;b.onclick=()=>input({type:3,key});}
    const body=el('div',null,main,'map-body');
    viewport=svg('svg',body,{tabindex:'0',role:'group','aria-label':'Mapa do código. Tab seleciona; Espaço expande; Enter abre o código. Shift Tab sai do mapa.'});
    const defs=svg('defs',viewport),marker=svg('marker',defs,{id:'arrow',viewBox:'0 0 10 10',refX:10,refY:5,markerWidth:7,markerHeight:7,orient:'auto-start-reverse'});svg('path',marker,{d:'M 0 0 L 10 5 L 0 10 z'});
    edgesLayer=svg('g',viewport,{'aria-hidden':'true'});nodesLayer=svg('g',viewport);
    const aside=el('aside',null,body);el('h2','Elemento e relações',aside);detail=el('pre',null,aside,'prose');detail.tabIndex=0;
    const help=el('p','Arraste o fundo ou os nós · Roda: zoom · Tab: selecionar · Espaço: expandir · Enter: código · P: fixar · M: movimento · Shift+Tab: sair',main,'help');help.id='map-help';viewport.setAttribute('aria-describedby',help.id);
    const point=e=>{const r=viewport.getBoundingClientRect();return {x:e.clientX-r.left,y:e.clientY-r.top};};
    viewport.onpointerdown=e=>{if(e.button!==0)return;viewport.focus();viewport.setPointerCapture(e.pointerId);input({type:4,...point(e)});};
    const flushMotion=()=>{if(motionFrame)cancelAnimationFrame(motionFrame);motionFrame=null;if(pendingMotion){input(pendingMotion);pendingMotion=null;}};
    viewport.onpointermove=e=>{if(!viewport.hasPointerCapture(e.pointerId))return;pendingMotion={type:10,...point(e)};if(!motionFrame)motionFrame=requestAnimationFrame(flushMotion);};
    viewport.onpointerup=e=>{flushMotion();input({type:11,...point(e)});if(viewport.hasPointerCapture(e.pointerId))viewport.releasePointerCapture(e.pointerId);};
    viewport.onpointercancel=()=>{pendingMotion=null;input({type:8});};
    viewport.onlostpointercapture=()=>input({type:8});viewport.onblur=()=>input({type:8});
    viewport.addEventListener('wheel',e=>{e.preventDefault();const unit=e.deltaMode===1?16:e.deltaMode===2?viewport.clientHeight:1;input({type:12,...point(e),dx:e.deltaX*unit/100,dy:-e.deltaY*unit/100});},{passive:false});
    viewport.onkeydown=e=>{
      if(e.ctrlKey||e.altKey||e.metaKey||e.shiftKey)return;
      const key={Tab:9,Enter:13,' ':32,ArrowLeft:1073741904,ArrowRight:1073741903,ArrowUp:1073741906,ArrowDown:1073741905,m:109,p:112,r:114}[e.key]??(/^[0-8]$/.test(e.key)?e.key.charCodeAt(0):undefined);
      if(e.key==='PageDown'||e.key==='PageUp'){e.preventDefault();detail.scrollBy(0,detail.clientHeight*(e.key==='PageDown'?1:-1));return;}
      if(key!==undefined){e.preventDefault();if(!e.repeat)input({type:3,key});}
    };
    new ResizeObserver(()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(resize,80);}).observe(viewport);
    new MutationObserver(resize).observe(document.body,{attributes:true,attributeFilter:['class']});
  }
  function renderMap(p){
    main.querySelector('select').value=String(p.filter||0);
    const motion=main.querySelector('[data-key="109"]');motion.setAttribute('aria-pressed',String(p.reduced));motion.textContent=p.reduced?'Ativar movimento':'Reduzir movimento';
    const zoom=p.zoom,width=180*zoom,height=60*zoom,seen=new Set();
    for(const n of Object.values(p.nodes)){
      seen.add(n.id);let g=nodes.get(n.id);
      if(!g){g=svg('g',nodesLayer,{role:'img'});svg('rect',g,{rx:7});svg('text',g);svg('circle',g,{r:3});nodes.set(n.id,g);}
      g.setAttribute('transform',`translate(${n.x} ${n.y})`);g.setAttribute('class',`node category-${n.category} state-${n.state}${n.selected?' selected':''}${n.neighbor?' neighbor':''}${n.pinned?' pinned':''}`);
      g.setAttribute('aria-label',n.label+(n.selected?', selecionado':'')+(n.pinned?', fixado':''));
      const [rect,text,pin]=g.children;rect.setAttribute('width',width);rect.setAttribute('height',height);text.setAttribute('x',8*zoom);text.setAttribute('y',35*zoom);text.setAttribute('font-size',14*zoom);text.textContent=n.label;pin.setAttribute('cx',width-8);pin.setAttribute('cy',8);
    }
    for(const [id,g] of nodes)if(!seen.has(id)){g.remove();nodes.delete(id);}seen.clear();
    for(const e of Object.values(p.edges)){
      seen.add(e.id);let line=edges.get(e.id);if(!line){line=svg('line',edgesLayer,{'marker-end':'url(#arrow)'});edges.set(e.id,line);}
      for(const k of ['x1','y1','x2','y2'])line.setAttribute(k,e[k]);line.setAttribute('class',`edge state-${e.state}${e.selected?' selected':''}`);
    }
    for(const [id,line] of edges)if(!seen.has(id)){line.remove();edges.delete(id);}
    const description=p.detail||'Selecione um elemento para consultar suas relações.';if(detail.textContent!==description)detail.textContent=description;
    main.classList.toggle('stale',p.stale);
  }
  window.addEventListener('message',event=>{
    const p=event.data;
    if(p.kind==='viewState'){
      if(state?.session===p.session&&p.sequence<=state.sequence)return;
      const first=!connected;if(state?.session!==p.session)lastSystemMotion=undefined;state=p;connected=true;start.hidden=true;close.hidden=false;main.hidden=false;document.querySelector('.session').hidden=kind==='map';
      message.textContent=kind==='map'?p.notice:(p.saved?'Progresso salvo':'Salvando progresso…');
      if(!main.childElementCount){kind==='map'?map():companion();if(kind==='companion')window.scrollTo(0,stored.scroll||0);}
      if(kind==='map'){renderMap(p);if(first)resize();}
      else{
        document.getElementById('objective-title').textContent=`${p.step+1}. ${p.title}`;
        for(const key of ['objective','explanation','result'])document.getElementById(key).textContent=p[key];
        document.getElementById('relation').textContent=p.relation||'';
        main.className=`font-${p.font}`;
        for(const b of main.querySelectorAll('[data-action]')){const id=Number(b.dataset.action);b.disabled=(id===2&&!p.approved)||(id===3&&p.step===0)||([1,7,9].includes(id)&&p.busy);}
      }
    }else if(['idle','loading','failure'].includes(p.kind)){
      document.querySelector('.session').hidden=false;
      connected=false;message.textContent=p.message||(p.kind==='loading'?'Conectando…':'Abra para iniciar nesta área de trabalho.');
      start.hidden=p.kind==='loading';close.hidden=p.kind==='idle';
      if(p.kind==='idle'){state=null;main.hidden=true;}
      main.classList.add('stale');
    }
  });
  window.addEventListener('scroll',()=>vscode.setState({scroll:window.scrollY}),{passive:true});
  post({kind:'ready'});
})();
