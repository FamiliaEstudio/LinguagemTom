'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {execute}=require('../../../tom-lang/tests/helpers'),{loadModules}=require('../../../tom-lang/core/module-loader');
const fs=require('node:fs');
for(const optimize of ['-O0','-O2'])test('demonstração de grafo com dados simulados '+optimize,()=>{
 const file=path.resolve(__dirname,'../src/mapa-simulado.tom'),source=fs.readFileSync(file,'utf8');
 const r=execute(source,{file,modules:loadModules(source,file),optimize,events:'mouse 100 150\nmotion 110.5 170.25\nrelease 110 170\nwheel 100 150 0.25 0.5 0\nfocuslost\nresize 1080 912\nquit\n',maximumLiveObjects:12,environment:{SDL_VIDEODRIVER:'dummy',SDL_RENDER_DRIVER:'software'}});
 assert.equal(r.status,0,r.stdout+r.stderr);assert.match(r.trace,/VISUAL @ULTIMO da soma/);
});
for(const optimize of ['-O0','-O2'])test('mil atualizações do mapa reutilizam recursos; falha preserva a publicação '+optimize,{timeout:90000},()=>{
 const item=(id,label)=>({id,group:0,category:2,state:0,label,detail:'Função '+label,expanded:false});
 const data=JSON.stringify({blocks:{0:{nodes:[item(1,'F'),item(2,'G')],edges:[{id:1,from:1,to:2,category:3,state:0}]}},labels:{},details:{}});
 const file=path.resolve(__dirname,'../src/teste-mapa.tom');
 const source=`Importar[l'./mapa-modelo.tom']
DefRecursoxJyJanelaCriar[l'mapa',320,240]
DefRecursoxFyFonteCarregar[14]
DefRecursoxCatalogoyCatalogoVisualCriar[@J,1024]
DefRecursoxAtualyJsonCriar[4194304]
DefRecursoxEtapayJsonLer[l'${data}',4194304]
DefArraySoAxNosxGrafoNox512
DefArraySoAxArestasxGrafoArestax2048
ParaxI[0,1000,1]
ChamarxMapaAplicar[@Nos,@Arestas,@Catalogo,@F,@Atual,@Etapa,1,2,1,@I]
FimPara
ChamarxGrafoMover[@Nos,1,500.0,600.0,0,Verdadeiro,Verdadeiro]
JsonDefinirTexto[@Etapa,l'/blocks/0/nodes/0/label',l'Novo']
JsonDefinirInSd64[@Etapa,l'/blocks/0/edges/0/to',999]
DefVarBlxFalhouyFalso
Tentar
ChamarxMapaAplicar[@Nos,@Arestas,@Catalogo,@F,@Atual,@Etapa,1,2,1,1000]
CapturarxErro
SetVarBlxFalhouyVerdadeiro
FimTentar
Exigir[@Falhou]
CompararIgualxyFl64xNos@0.xy500.0
Exigir[@ULTIMO]
DefStkFB64CxRotuloyl''
JsonObterTexto[@Atual,l'/labels/1',@Rotulo]
TextosIguais[@Rotulo,l'F']
Exigir[@ULTIMO]
GerarTxtxl'OK'`;
 const r=execute(source,{file,modules:loadModules(source,file),optimize,events:'',maximumLiveObjects:40,environment:{SDL_VIDEODRIVER:'dummy',SDL_RENDER_DRIVER:'software'}});
 assert.equal(r.status,0,r.stdout+r.stderr);assert.equal(r.stdout,'OK');assert.equal((r.trace.match(/^VISUAL F$/gm)||[]).length,1);assert.equal((r.trace.match(/^VISUAL G$/gm)||[]).length,1);
});
