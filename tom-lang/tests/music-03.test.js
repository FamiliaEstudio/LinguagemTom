'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {execute}=require('./helpers');
const {loadModules}=require('../core/module-loader');
for(const optimize of ['-O0','-O2'])test(`Tom musical spelling, pitch, timing and resource cleanup (${optimize})`,()=>{
  const source=`Importar[l'tom/musica']
ChamarxMusicaAltura[@MUSICA_C,4,1]
DefVarInSd32xSustenidoy@ULTIMO
ChamarxMusicaAltura[@MUSICA_D,4,-1]
CompararIgualxyInSd32x@ULTIMOy@Sustenido
Exigir[@ULTIMO]
ChamarxMusicaPosicaoSol[@MUSICA_C,4]
DefVarInSd32xPosCy@ULTIMO
ChamarxMusicaPosicaoSol[@MUSICA_D,4]
CompararDiferentexyInSd32x@ULTIMOy@PosC
Exigir[@ULTIMO]
ChamarxMusicaFrequencia[69]
CompararIgualxyFl64x@ULTIMOy440.0
Exigir[@ULTIMO]
ChamarxMusicaPrazoNs[1000,1200,1,1,120]
CompararIgualxyInSd64x@ULTIMOy600000001000
Exigir[@ULTIMO]
ChamarxMusicaPrazoNs[0,3,1,3,120]
CompararIgualxyInSd64x@ULTIMOy500000000
Exigir[@ULTIMO]
DefArraySoAxNotasxNotaMusicalx1
SetVarInSd32xNotas@0.letray@MUSICA_A
SetVarInSd32xNotas@0.oitavay4
ChamarxMusicaAlturaDaNota[@Notas,0]
CompararIgualxyInSd32x@ULTIMOy69
Exigir[@ULTIMO]
Tentar
ChamarxMusicaAltura[7,4,0]
CapturarxInvalida
GerarTxtxl'invalid;'
FimTentar
EscopoInixRecursos
DefRecursoxAyAudioCriar[]
DeferGerarTxtxl'cleanup;'
Tentar
AudioTom[@A,0,30000.0,0.1,1000000]
CapturarxAudioInvalido
GerarTxtxl'caught;'
FimTentar
AudioAgendarTom[@A,0,440.0,0.1,1000000,0]
AudioPausar[@A,Falso]
EscopoFimxRecursos
GerarTxtxl'OK'`;
  const result=execute(source,{optimize,modules:loadModules(source,'case.tom'),environment:{SDL_AUDIODRIVER:'dummy'}});
  assert.equal(result.status,0,result.stdout+result.stderr);assert.equal(result.stdout,'invalid;caught;cleanup;OK');
});
test('animation positions depend on elapsed time, not the number of frames',()=>{
  const file=path.join(__dirname,'../exemplos/multimedia/animation-test.tom');
  let source="Importar[l'./comum.tom']\n";
  // Directly call the same Tom update function used by the animation demo.
  for(const elapsed of [0,1000000000,3333333333,5000000000,11000000000]) {
    const expected=40+(elapsed%5000000000)/1e9*144;
    source+=`ChamarxDemoPosicao[${elapsed}]\nDefVarFl64xP${elapsed}y@ULTIMO\nCompararMenorxyFl64xP${elapsed}y${expected+0.00001}\nExigir[@ULTIMO]\nCompararMaiorxyFl64xP${elapsed}y${expected-0.00001}\nExigir[@ULTIMO]\n`.replace(/xP/g,'x@P');
  }
  // Restore declaration names after adding operand reference markers.
  source=source.replace(/DefVarFl64x@/g,'DefVarFl64x')+"GerarTxtxl'OK'";
  const result=execute(source,{file,modules:loadModules(source,file),optimize:'-O2'});
  assert.equal(result.status,0,result.stdout);assert.equal(result.stdout,'OK');
});
test('all multimedia demonstration sources resolve their modules',()=>{
  const {compileResolved}=require('../core/module-loader');
  for(const name of ['animacao','teclado','catalogo','audio']) {
    const file=path.join(__dirname,'../exemplos/multimedia',name+'.tom');
    const result=compileResolved(fs.readFileSync(file,'utf8'),{file});assert.equal(result.success,true,JSON.stringify(result.diagnostics));
  }
});
test('missing audio device is catchable and unwinds user cleanup',()=>{
  const source=`DefFuncaoxAbrir[]yVazio
DeferGerarTxtxl'cleanup;'
DefRecursoxAyAudioCriar[]
FimFuncao
Tentar
ChamarxAbrir[]
CapturarxFalha
ErroCodigo xFalha
CompararIgualxyInSd32x@ULTIMOy8
Exigir[@ULTIMO]
GerarTxtxl'caught'
FimTentar`.replace('ErroCodigo x','ErroCodigox');
  const result=execute(source,{optimize:'-O2',environment:{SDL_AUDIODRIVER:'tom_nonexistent_driver'}});
  assert.equal(result.status,0,result.stdout+result.stderr);assert.equal(result.stdout,'cleanup;caught');
});
