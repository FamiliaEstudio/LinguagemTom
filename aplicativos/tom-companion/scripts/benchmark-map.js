'use strict';
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {analyzeProject}=require('../../../tom-lang/core/project-analysis');
const {execute}=require('../../../tom-lang/tests/helpers'),{loadModules}=require('../../../tom-lang/core/module-loader');
const source=Array.from({length:100},(_,f)=>`DefFuncaoxF${f}[]yVazio\n`+Array.from({length:98},(_,i)=>`DefVarInSd32xV${i}y1`).join('\n')+'\nFimFuncao').join('\n');
const analysis=[];let previous;
for(let i=0;i<6;i++){const before=performance.now();previous=analyzeProject({source:'// '+i+'\n'+source},{previous});analysis.push(performance.now()-before);}
const program=`Importar[l'tom/grafos']
DefRecursoxJyJanelaCriar[l'Mapa benchmark',1200,780]
DefRecursoxFyFonteCarregar[14]
DefRecursoxCyCatalogoVisualCriar[@J,512]
CatalogoVisualTexto[@C,@F,l'No']
DefVarInSd64xVisualy@ULTIMO
DefArraySoAxNosxGrafoNox512
DefArraySoAxArestasxGrafoArestax2048
ChamarxCanvasCriar[]
DefVarRegistro<CanvasCamera>xCameray@ULTIMO
SetVarFl64xCamera.zoom y0.25
SetVarFl64xCamera.yy96.0
ParaIndiceSOAxI[@Nos]
DividxyInSd64x@Iy16
DefVarInSd64xLinhay@ULTIMO
MultixyInSd64x@Linhay16
SubtrxyInSd64x@Iy@ULTIMO
InSd64ParaFl64[@ULTIMO]
MultixyFl64x@ULTIMOy200.0
SetVarFl64xNos@@I.xy@ULTIMO
InSd64ParaFl64[@Linha]
MultixyFl64x@ULTIMOy76.0
SetVarFl64xNos@@I.yy@ULTIMO
SetVarBlxNos@@I.ativoyVerdadeiro
SetVarBlxNos@@I.visivelyVerdadeiro
SetVarInSd64xNos@@I.visualy@Visual
FimPara
ParaIndiceSOAxI[@Arestas]
DividxyInSd64x@Iy512
MultixyInSd64x@ULTIMOy512
SubtrxyInSd64x@Iy@ULTIMO
SetVarInSd64xArestas@@I.origemy@ULTIMO
SomarxyInSd64x@Iy17
DefVarInSd64xDestinoy@ULTIMO
DividxyInSd64x@Destinoy512
MultixyInSd64x@ULTIMOy512
SubtrxyInSd64x@Destinoy@ULTIMO
SetVarInSd64xArestas@@I.destinoy@ULTIMO
SetVarBlxArestas@@I.ativayVerdadeiro
FimPara
TempoAgoraNs[]
DefVarInSd64xInicioy@ULTIMO
ParaxQuadro[0,60,1]
JanelaLimpar[@J,4294967295]
ChamarxGrafoDesenhar[@J,@C,@Nos,@Arestas,@Camera,820,624]
JanelaApresentar[@J]
FimPara
TempoAgoraNs[]
SubtrxyInSd64x@ULTIMOy@Inicio
DefVarInSd64xDuracaoy@ULTIMO
DefStkFB32CxTextoyl''
InSd64ParaTexto[@Duracao,@Texto]
GerarTxtxTexto`.replace('zoom y','zoomy');
const renders=[];
for(const optimize of ['-O0','-O2']){const run=execute(program,{optimize,modules:loadModules(program,'case.tom'),events:'',maximumLiveObjects:8,environment:{SDL_VIDEODRIVER:'dummy',SDL_RENDER_DRIVER:'software'}});if(run.status!==0)throw Error(run.stdout+run.stderr);const durationNs=Number(run.stdout);renders.push({optimize,frames:60,nodes:512,edges:2048,seconds:durationNs/1e9,fps:60e9/durationNs});}
const result={date:new Date().toISOString(),platform:process.platform,release:os.release(),cpu:os.cpus()[0]?.model,logicalCores:os.cpus().length,memoryBytes:os.totalmem(),node:process.version,renderer:'SDL software / dummy, sem capturas por quadro',instructions:10000,analysisMs:analysis,render:renders};
const output=path.resolve(__dirname,'../build/map-benchmark-'+process.platform+'.json');fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
