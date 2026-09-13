'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {execute}=require('./helpers');
const {loadModules}=require('../core/module-loader');
for(const optimize of ['-O0','-O2'])test(`0.4 entrada: combinações, repetição, soltura, foco e remapeamento ${optimize}`,()=>{
  const source=`Importar[l'tom/entrada']
DefArraySoAxVinculosxEntradaVinculox4
DefArraySoAxAcoesxEntradaAcaox2
DefVarRegistro<EntradaEvento>xEventoyPadrao
// A ação zero exige A+W. A ação um aceita A ou B por posição física.
ParaIndiceSOAxI[@Vinculos]
SetVarBlxVinculos@@I.habilitadoyVerdadeiro
FimPara
SetVarInSd32xVinculos@0.codigoy@TECLA_A
SetVarInSd32xVinculos@1.codigoy@TECLA_W
SetVarInSd64xVinculos@2.acaoy1
SetVarInSd64xVinculos@2.grupoy1
SetVarBlxVinculos@2.fisicayVerdadeiro
SetVarInSd32xVinculos@2.codigoy@FISICA_A
SetVarInSd64xVinculos@3.acaoy1
SetVarInSd64xVinculos@3.grupoy2
SetVarBlxVinculos@3.fisicayVerdadeiro
SetVarInSd32xVinculos@3.codigoy@FISICA_B
ChamarxEntradaRemapear[@Vinculos,@Acoes,0]
SetVarInSd32xEvento.tipoy@EVENTO_PRESSIONAR
SetVarInSd32xEvento.teclay@TECLA_A
SetVarInSd32xEvento.fisicay@FISICA_A
SetVarInSd64xEvento.tempoNsy9007199254740993
ChamarxEntradaAtualizar[@Vinculos,@Acoes,@Evento]
NaoBlxAcoes@0.mantida
Exigir[@ULTIMO]
Exigir[Acoes@1.pressionada]
SetVarInSd32xEvento.teclay@TECLA_W
SetVarInSd32xEvento.fisicay@FISICA_W
ChamarxEntradaAtualizar[@Vinculos,@Acoes,@Evento]
Exigir[Acoes@0.pressionada]
CompararIgualxyInSd64xAcoes@0.tempoNsy9007199254740993
Exigir[@ULTIMO]
SetVarInSd32xEvento.repeticaoy1
ChamarxEntradaAtualizar[@Vinculos,@Acoes,@Evento]
Exigir[Acoes@0.repetida]
NaoBlxAcoes@0.pressionada
Exigir[@ULTIMO]
SetVarInSd32xEvento.tipoy@EVENTO_SOLTAR
ChamarxEntradaAtualizar[@Vinculos,@Acoes,@Evento]
Exigir[Acoes@0.solta]
Exigir[Acoes@1.mantida]
SetVarInSd32xEvento.tipoy@EVENTO_PERDER_FOCO
ChamarxEntradaAtualizar[@Vinculos,@Acoes,@Evento]
Exigir[Acoes@1.solta]
NaoBlxAcoes@1.mantida
Exigir[@ULTIMO]
// Repetição isolada não cria pressionamento após perder foco.
SetVarInSd32xEvento.tipoy@EVENTO_PRESSIONAR
SetVarInSd32xEvento.teclay@TECLA_A
SetVarInSd32xEvento.fisicay@FISICA_A
ChamarxEntradaAtualizar[@Vinculos,@Acoes,@Evento]
NaoBlxAcoes@1.pressionada
Exigir[@ULTIMO]
SetVarInSd32xEvento.repeticaoy0
ChamarxEntradaAtualizar[@Vinculos,@Acoes,@Evento]
Exigir[Acoes@1.pressionada]
ChamarxEntradaRemapear[@Vinculos,@Acoes,100]
Exigir[Acoes@1.solta]
GerarTxtxl'OK'`;
  const r=execute(source,{optimize,modules:loadModules(source,'case.tom')});
  assert.equal(r.status,0,r.stdout);assert.equal(r.stdout,'OK');
});
