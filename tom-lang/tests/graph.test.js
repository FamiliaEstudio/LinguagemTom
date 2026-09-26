'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {execute}=require('./helpers'),{loadModules}=require('../core/module-loader');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {command}=require('./helpers'),{linkArguments,copyAssets}=require('../core/native-build');
for(const optimize of ['-O0','-O2'])test('SDL wheel real translation: opt-in, time, fractions and direction '+optimize,()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'tom-wheel-')),binary=path.join(dir,process.platform==='win32'?'wheel.exe':'wheel');
 try{
  const native=process.env.TOM_NATIVE_ROOT||path.resolve(__dirname,'../../.tools',process.platform==='win32'?'windows':'linux','native');
  command(process.env.CLANG||'clang',[optimize,'-Wall','-Wextra','-Werror','-I'+path.join(__dirname,'../runtime/stable'),'-I'+path.join(native,'include'),path.join(__dirname,'fixtures/wheel-runtime.c'),'-o',binary,...linkArguments(['ui'])]);copyAssets(dir,['ui']);
  assert.match(command(binary,[],{env:{...process.env,SDL_VIDEODRIVER:'dummy',SDL_RENDER_DRIVER:'software'}}).stdout,/wheel-runtime-ok/);
 }finally{fs.rmSync(dir,{recursive:true,force:true,maxRetries:10,retryDelay:100});}
});
for(const optimize of ['-O0','-O2'])test('canvas, geometria e grafo: zoom, limpeza, fixação e tempo '+optimize,()=>{
 const source=`Importar[l'tom/grafos']
ChamarxCanvasCriar[]
DefVarRegistro<CanvasCamera>xCy@ULTIMO
ChamarxCanvasZoom[@C,2.0,100.0,50.0]
ChamarxCanvasConteudoX[@C,100.0]
CompararIgualxyFl64x@ULTIMOy100.0
Exigir[@ULTIMO]
ChamarxCanvasZoom[@C,100.0,100.0,50.0]
CompararIgualxyFl64x@C.zoom y4.0
Exigir[@ULTIMO]
ChamarxCanvasArrasteIniciar[@C,1.5,3.25]
ChamarxCanvasArrasteTerminar[@C]
DefVarFl64xXy@C.x
ChamarxCanvasArrasteMover[@C,100.0,400.0]
CompararIgualxyFl64x@C.xy@X
Exigir[@ULTIMO]
ChamarxGeometriaDistanciaSegmento[5.0,4.0,0.0,0.0,10.0,0.0]
CompararIgualxyFl64x@ULTIMOy4.0
Exigir[@ULTIMO]
RaizQuadradaFl64[9.0]
CompararIgualxyFl64x@ULTIMOy3.0
Exigir[@ULTIMO]
Tentar
RaizQuadradaFl64[-1.0]
Falhar[1]
CapturarxErro
ErroCodigoxErro
CompararIgualxyInSd32x@ULTIMOy4
Exigir[@ULTIMO]
FimTentar
DefArraySoAxNosxGrafoNox4
DefArraySoAxArestasxGrafoArestax4
ChamarxGrafoInserirNo[@Nos,1,0,1,0,0]
ChamarxGrafoInserirNo[@Nos,2,1,2,0,0]
ChamarxGrafoInserirAresta[@Nos,@Arestas,1,1,2,1,0]
ChamarxGrafoMover[@Nos,2,400.0,200.0,0,Verdadeiro,Verdadeiro]
ChamarxGrafoMover[@Nos,2,900.0,600.0,0,Falso,Falso]
CompararIgualxyFl64xNos@1.xy400.0
Exigir[@ULTIMO]
ChamarxGrafoInserirNo[@Nos,2,1,2,1,99]
CompararIgualxyFl64xNos@1.xy400.0
Exigir[@ULTIMO]
SetVarBlxNos@1.fixadoyFalso
ChamarxGrafoMover[@Nos,2,600.0,200.0,0,Falso,Falso]
ChamarxGrafoAnimar[@Nos,90000000,Falso]
CompararIgualxyFl64xNos@1.xy500.0
Exigir[@ULTIMO]
ChamarxGrafoAnimar[@Nos,900000000,Falso]
CompararIgualxyFl64xNos@1.xy600.0
Exigir[@ULTIMO]
ChamarxGrafoRemoverNo[@Nos,@Arestas,2]
NaoBlxArestas@0.ativa
Exigir[@ULTIMO]
// O mesmo instante, com sequências diferentes de quadros e pausa explícita.
ParaxTaxa[0,3,1]
DefVarInSd64xFPSy30
CompararIgualxyInSd64x@Taxay1
Sex@ULTIMO
SetVarInSd64xFPSy60
FimSe
CompararIgualxyInSd64x@Taxay2
Sex@ULTIMO
SetVarInSd64xFPSy144
FimSe
ChamarxGrafoMover[@Nos,1,100.0,100.0,0,Verdadeiro,Verdadeiro]
SetVarBlxNos@0.fixadoyFalso
ChamarxGrafoMover[@Nos,1,400.0,100.0,0,Falso,Falso]
ParaxQuadro[0,@FPS,1]
MultixyInSd64x@Quadroy90000000
DividxyInSd64x@ULTIMOy@FPS
ChamarxGrafoAnimar[@Nos,@ULTIMO,Falso]
FimPara
ChamarxGrafoAnimar[@Nos,90000000,Falso]
CompararIgualxyFl64xNos@0.xy250.0
Exigir[@ULTIMO]
ChamarxGrafoAnimar[@Nos,90000000,Falso]
CompararIgualxyFl64xNos@0.xy250.0
Exigir[@ULTIMO]
ChamarxGrafoAnimar[@Nos,900000000,Falso]
CompararIgualxyFl64xNos@0.xy400.0
Exigir[@ULTIMO]
FimPara
GerarTxtxl'OK'`.replace('zoom y','zoomy');
 const run=execute(source,{optimize,modules:loadModules(source,'case.tom')});assert.equal(run.status,0,run.stdout+run.stderr);assert.equal(run.stdout,'OK');
});
test('rolagem precisa é opt-in, normaliza direção e mantém coordenadas inteiras',()=>{
 const source=`DefRecursoxJyJanelaCriar[l'roda',320,240]
DefRecursoxEyEventoCriar[]
JanelaEventosPonteiro[@J,Verdadeiro]
JanelaEventosRolagem[@J,Verdadeiro]
EventoAguardar[@J,@E]
EventoCampo[@E,0]
CompararIgualxyInSd32x@ULTIMOy12
Exigir[@ULTIMO]
EventoCampoFl64[@E,1]
CompararIgualxyFl64x@ULTIMOy10.5
Exigir[@ULTIMO]
EventoCampo[@E,1]
CompararIgualxyInSd32x@ULTIMOy10
Exigir[@ULTIMO]
EventoCampoFl64[@E,12]
CompararIgualxyFl64x@ULTIMOy-0.25
Exigir[@ULTIMO]
EventoCampoFl64[@E,13]
CompararIgualxyFl64x@ULTIMOy1.5
Exigir[@ULTIMO]
GerarTxtxl'OK'`;
 const run=execute(source,{events:'wheel 10.5 20.25 0.25 -1.5 1\n',environment:{SDL_VIDEODRIVER:'dummy',SDL_RENDER_DRIVER:'software'}});assert.equal(run.status,0,run.stdout+run.stderr);assert.equal(run.stdout,'OK');
});
