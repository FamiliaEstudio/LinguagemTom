'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawnSync}=require('node:child_process');
const {compile,analyze}=require('../core/compiler');
const {buildApplication}=require('../core/native-build');
const quote=s=>"l'"+s.replace(/\\/g,'\\\\').replace(/'/g,"\\'").replace(/\n/g,'\\n')+"'";
function courseAt(root){return JSON.parse(fs.readFileSync(path.join(root,'aplicativos/tom-companion/courses/calculadora/roteiro.json'),'utf8'));}
function functionText(source,a){
  const ranges=a.instructions.filter(n=>['function','constant','struct','record','enum'].includes(n.kind)).map(n=>[n.location.line,n.kind==='constant'?n.location.line:a.instructions.find(e=>e.opens===n.id&&['endFunction','endStruct'].includes(e.kind)).location.line]);
  return source.split(/\r?\n/).map((line,i)=>ranges.some(([first,last])=>i+1>=first&&i+1<=last)?line:'').join('\n');
}
function probes(course,index){
  const known=new Set(course.steps.slice(0,index+1).flatMap(s=>s.checks));
  const tests=[];const add=(input,code,expected)=>tests.push({input,code,expected});
  const print="GerarTxtxTCOut\nGerarTxtxl'\\n'\n";
  const dec=(call)=>call+'\nDc34ParaTexto[@ULTIMO,@TCOut]\n'+print;
  const int=(call)=>call+'\nInteiroParaTexto[@ULTIMO,@TCOut]\n'+print;
  const buffer=(call)=>call+'\nCopiarTxt[@TCOut,@TCBuffer]\n'+print;
  const caught=call=>'Tentar\n'+call+"\nCopiarTxt[@TCOut,l'SEM_ERRO']\n"+print+'CapturarxTCError\nErroCodigoxTCError\nInteiroParaTexto[@ULTIMO,@TCOut]\n'+print+'FimTentar\n';
  const arithmetic=[...known].filter(x=>x.startsWith('arithmetic:')).map(x=>Number(x.split(':')[1]));
  if(arithmetic.length){const count=Math.max(...arithmetic);
    const examples=[[['0.1','0.2','0.3'],['-5','2','-3'],['15','7','22']],[['0.1','0.2','-0.1'],['-5','2','-7']],[['1.5','2','3'],['-5','2','-10']],[['7','2','3.5'],['1','3','0.3333333333333333333333333333333333']]];
    examples.slice(0,count).forEach((xs,op)=>xs.forEach(([a,b,value])=>add(`Calcular(${11+op}, ${a}, ${b})`,dec(`ChamarxCalcular[${11+op},${a},${b}]`),value)));
    add('Operador desconhecido: devolver B',dec('ChamarxCalcular[-1,8,3]'),'3');
    if(count===4)add('Calcular(14, 1, 0): erro de divisão',caught('ChamarxCalcular[14,1,0]'),'2');
  }
  if(known.has('value')){for(const [text,value] of [['12.','12'],['0.1','0.1'],['-3.5','-3.5'],['9007199254740993','9007199254740993']])add('Valor('+text+')',dec(`ChamarxValor[${quote(text)}]`),value);add('Valor(ab): entrada inválida',caught("ChamarxValor[l'ab']"),'4');}
  if(known.has('digits')){
    add('Digitar 1, 2',buffer("CopiarTxt[@TCBuffer,l'0']\nChamarxDigitar[@TCBuffer,1,Verdadeiro]\nChamarxDigitar[@TCBuffer,2,Falso]"),'12');
    add('Nova entrada depois de 123',buffer("CopiarTxt[@TCBuffer,l'123']\nChamarxDigitar[@TCBuffer,7,Verdadeiro]"),'7');
  }
  if(known.has('separator'))add('Dois separadores e um dígito',buffer("CopiarTxt[@TCBuffer,l'0']\nChamarxDigitar[@TCBuffer,10,Falso]\nChamarxDigitar[@TCBuffer,10,Falso]\nChamarxDigitar[@TCBuffer,5,Falso]"),'0.5');
  if(known.has('sign'))for(const [a,b] of [['12','-12'],['-12','12']])add('Trocar sinal de '+a,buffer(`CopiarTxt[@TCBuffer,${quote(a)}]\nChamarxSinal[@TCBuffer]`),b);
  if(known.has('backspace'))for(const [a,n,b] of [['123','Falso','12'],['1','Falso','0'],['-1','Falso','0'],['123','Verdadeiro','0']])add('Apagar '+a+' Nova='+n,buffer(`CopiarTxt[@TCBuffer,${quote(a)}]\nChamarxApagar[@TCBuffer,${n}]`),b);
  if(known.has('command-digits')){for(let i=0;i<10;i++)add('Código do dígito '+i,int(`ChamarxComando[${48+i}]`),String(i));add('Comando desconhecido',int('ChamarxComando[1000]'),'-1');}
  if(known.has('commands'))for(const [char,result] of [['.',10],[',',10],['+',11],['-',12],['−',12],['*',13],['×',13],['/',14],['÷',14],['=',15],['\r',15],['±',16],['c',17],['C',17],['\x1b',17],['\b',18]])add('Comando '+JSON.stringify(char),int(`ChamarxComando[${char.codePointAt(0)}]`),String(result));
  if(known.has('position-first')){add('Clique no centro de C',int('ChamarxPosicao[70,250]'),'17');add('Borda direita de C',int('ChamarxPosicao[126,250]'),'-1');add('Fora dos botões',int('ChamarxPosicao[10,10]'),'-1');}
  if(known.has('positions')){
    const rows=[[17,18,16,14],[7,8,9,13],[4,5,6,12],[1,2,3,11],[0,10,15]];
    rows.forEach((row,y)=>row.forEach((value,x)=>add(`Botão linha ${y+1}, coluna ${x+1}`,int(`ChamarxPosicao[${75+110*x},${250+80*y}]`),String(value))));
    add('Borda inferior',int('ChamarxPosicao[70,288]'),'-1');
  }
  return tests;
}
function run(source,file,directory,optimize,{events}={}){
  const c=compile(source,{file});if(!c.success)return {diagnostics:c.diagnostics,status:-1,stdout:'',stderr:''};
  const executable=buildApplication(c,file,directory,{testUI:events!==undefined,optimize});
  const env={...process.env};let traceFile;
  if(events!==undefined){env.SDL_VIDEODRIVER='dummy';env.SDL_RENDER_DRIVER='software';env.TOM_UI_EVENTS=path.join(directory,'events.txt');traceFile=env.TOM_UI_TRACE=path.join(directory,'trace.txt');env.TOM_DATA_DIRECTORY=path.join(directory,'data');fs.writeFileSync(env.TOM_UI_EVENTS,events);}
  const r=spawnSync(executable,[],{encoding:'utf8',timeout:5000,maxBuffer:1048576,env});
  return {...r,trace:traceFile&&fs.existsSync(traceFile)?fs.readFileSync(traceFile,'utf8'):'',stdout:(r.stdout||'').replace(/\r\n/g,'\n'),stderr:r.stderr||''};
}
function frames(trace){return trace.split('FRAME\n').slice(0,-1).map(frame=>{
  const display=[...frame.matchAll(/^TEXT 36 86 (.*)$/gm)].at(-1)?.[1];
  const message=[...frame.matchAll(/^TEXT 24 176 (.*)$/gm)].at(-1)?.[1];return {display,message};
});}
function verify(root,source,index,{optimize='-O0',file='calculadora.tom',temporaryDirectory}={}){
  const course=courseAt(root),step=course.steps[index];if(!step)throw Error('Passo inexistente.');
  const a=analyze(source,{file});if(!a.success)return {passed:false,status:'invalid',diagnostics:a.diagnostics,message:'Corrija o diagnóstico antes de verificar este passo.'};
  const reference=analyze(fs.readFileSync(path.join(root,'aplicativos/tom-companion/courses/calculadora/referencia.tom'),'utf8'));
  for(const name of step.functions){
    const expected=reference.instructions.find(n=>n.kind==='function'&&n.name===name),found=a.instructions.find(n=>n.kind==='function'&&n.name===name);
    const contract=n=>n&&JSON.stringify([n.result,n.params.map(p=>[p.type,p.mutable])]);
    if(contract(found)!==contract(expected))return {passed:false,status:'incomplete',message:`Este passo precisa da função ${name} com a assinatura indicada no roteiro.`,expected:expected.text,observed:found?.text||'Função ainda ausente.'};
  }
  const temp=temporaryDirectory||fs.mkdtempSync(path.join(os.tmpdir(),'tom-companion-check-'));let count=0;
  const failure=(input,expected,observed,message='O programa compilou, mas o comportamento ainda é diferente do esperado.')=>({passed:false,status:'different',input,expected,observed,message});
  try{
    if(index===0){
      if(!a.instructions.some(n=>n.kind==='math'&&n.type==='Dc34')||!a.lastResults.some(n=>n.resolved&&a.instructions.find(i=>i.id===n.instruction)?.kind==='declare'))return failure('Guardar o resultado decimal','Soma Dc34 e declaração a partir de @ULTIMO','Essas construções ainda não foram encontradas.');
      const r=run(source,file,temp,optimize);return {passed:r.status===0&&r.stdout==='0.3',status:r.status===0&&r.stdout==='0.3'?'passed':'different',input:'0.1 + 0.2',expected:'0.3',observed:r.error?.message||r.stdout+r.stderr,message:r.status===0&&r.stdout==='0.3'?'Resultado conferido. Você pode avançar.':'Confira a operação e o texto produzido.',count:1};
    }
    const tests=probes(course,index);
    if(tests.length){
      const harness=functionText(source,a)+"\nDefStkFB256CxTCOutyl''\nDefStkFB128CxTCBufferyl''\n"+tests.map(t=>t.code).join('\n');
      const r=run(harness,file,temp,optimize),actual=r.stdout.split('\n');
      if(r.status!==0)return failure('Executar as funções','Término normal em até 5 segundos',r.error?.message||r.stdout+r.stderr||JSON.stringify(r.diagnostics));
      for(let i=0;i<tests.length;i++){if(actual[i]!==tests[i].expected)return failure(tests[i].input,tests[i].expected,actual[i]??'(nenhuma saída)');count++;}
      if(actual.slice(tests.length).join('\n')!=='')return failure('Saída das funções','Somente os resultados esperados',actual.slice(tests.length).join('\n'));
    }
    const checks=new Set(step.checks);
    if(index>=12){
      if(!a.instructions.some(n=>n.kind==='resource'&&n.builtin==='JanelaCriar')||!a.instructions.some(n=>n.kind==='builtin'&&n.name==='EventoAguardar'))return failure('Janela e espera de eventos','Criar a janela e aguardar eventos','Estrutura ainda incompleta.');
      let events='quit\n',expected;
      if(checks.has('events')){events='text 12\nkey 8\ntext ±\ntext c\nmouse 180 480\nresize 960 1280\nquit\n';expected=['0','12','1','-1','0','2','2'];}
      if(checks.has('sequential')){events='text 0.1+0,2=\ntext c2+3*4=\nquit\n';expected=['0','0,3','20'];}
      if(checks.has('repeat')){events='text 2+3==\ntext c2+3*4=\nkey 13\nquit\n';expected=['0','8','20','80'];}
      let oracle;
      if(checks.has('complete')){oracle=require(path.join(root,'benchmarks/calculator/workload')).workload();events=oracle.text+'quit\n';expected=oracle.observations.map(o=>o.display);}
      const r=run(source,file,temp,optimize,{events});
      if(r.status!==0)return failure('Janela e eventos','Término normal em até 5 segundos',r.error?.message||r.stdout+r.stderr);
      if(!r.trace.includes('FRAME\n'))return failure('Apresentar o quadro','Pelo menos um quadro apresentado','Nenhum quadro apresentado.');
      const observed=frames(r.trace);
      if(checks.has('button')&&!/^TEXT .* C$/m.test(r.trace))return failure('Botão C','Rótulo C desenhado','Rótulo não observado.');
      if(['draw','positions','position-first','state'].some(x=>checks.has(x))){if(observed[0]?.display!=='0')return failure('Visor inicial','0',observed[0]?.display||'(não observado)');}
      if(checks.has('state')){
        const top=a.instructions.filter(n=>!n.owner&&n.kind==='declare');
        if(top.filter(n=>n.type==='Dc34').length<2||top.filter(n=>n.type==='Bl').length<5)return failure('Estado entre eventos','Dois decimais e cinco indicadores booleanos do estado','Declarações ainda incompletas.');
      }
      if(expected){const actual=observed.map(o=>o.display);for(let i=0;i<Math.max(expected.length,actual.length);i++)if(expected[i]!==actual[i])return failure(`Quadro ${i+1} da sequência: ${events.replace(/\n/g,'; ')}`,expected[i]??'(sem quadro adicional)',actual[i]??'(nenhum visor)');
        if(oracle){for(let i=0;i<observed.length;i++)if((observed[i].message||'')!==oracle.observations[i].message)return failure(`Mensagem no quadro ${i+1}`,oracle.observations[i].message,observed[i].message||'');count+=oracle.cases.length;}else count+=expected.length;
      }else count++;
    }
    return {passed:true,status:'passed',count,message:`${count} verificações passaram. Você pode avançar quando quiser.`};
  }finally{fs.rmSync(temp,{recursive:true,force:true,maxRetries:10,retryDelay:100});}
}
module.exports={verify,probes,courseAt,frames};
