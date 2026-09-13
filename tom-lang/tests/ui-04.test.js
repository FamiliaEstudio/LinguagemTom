'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const {execute}=require('./helpers');const {loadModules}=require('../core/module-loader');
for(const optimize of ['-O0','-O2'])test(`0.4 UI Tom: foco, ativação, arraste e perda de foco ${optimize}`,()=>{
  const source=`Importar[l'tom/ui']
DefArraySoAxItensxUIComponentex3
DefVarRegistro<UIEstado>xEstadoyPadrao
DefVarRegistro<EntradaEvento>xEventoyPadrao
ChamarxUIInicializar[@Estado]
ParaIndiceSOAxI[@Itens]
SetVarBlxItens@@I.visivelyVerdadeiro
SetVarBlxItens@@I.habilitadoyVerdadeiro
SetVarInSd32xItens@@I.larguray100
SetVarInSd32xItens@@I.alturay30
SetVarInSd64xItens@@I.acaoy@I
FimPara
SetVarEnum<UIControle>xItens@0.tipoy@UIControle.Botao
SetVarEnum<UIControle>xItens@1.tipoy@UIControle.Seletor
SetVarEnum<UIControle>xItens@2.tipoy@UIControle.Deslizante
SetVarInSd32xItens@1.yy40
SetVarInSd32xItens@2.yy80
SetVarInSd32xEvento.tipoy@EVENTO_PRESSIONAR
SetVarInSd32xEvento.teclay@TECLA_TAB
ChamarxUIAtualizar[@Itens,@Estado,@Evento]
CompararIgualxyInSd64x@Estado.focoy0
Exigir[@ULTIMO]
SetVarInSd32xEvento.teclay@TECLA_ENTER
ChamarxUIAtualizar[@Itens,@Estado,@Evento]
CompararIgualxyInSd64x@Estado.acaoy0
Exigir[@ULTIMO]
SetVarInSd32xEvento.teclay@TECLA_TAB
ChamarxUIAtualizar[@Itens,@Estado,@Evento]
SetVarInSd32xEvento.teclay@TECLA_ESPACO
ChamarxUIAtualizar[@Itens,@Estado,@Evento]
Exigir[Itens@1.marcado]
SetVarInSd32xEvento.tipoy@EVENTO_MOUSE
SetVarInSd32xEvento.botaoy1
SetVarInSd32xEvento.xy25
SetVarInSd32xEvento.yy90
ChamarxUIAtualizar[@Itens,@Estado,@Evento]
CompararIgualxyFl64xItens@2.valory0.25
Exigir[@ULTIMO]
SetVarInSd32xEvento.tipoy@EVENTO_MOUSE_MOVER
SetVarInSd32xEvento.xy200
ChamarxUIAtualizar[@Itens,@Estado,@Evento]
CompararIgualxyFl64xItens@2.valory1.0
Exigir[@ULTIMO]
SetVarInSd32xEvento.tipoy@EVENTO_MOUSE_SOLTAR
ChamarxUIAtualizar[@Itens,@Estado,@Evento]
CompararIgualxyInSd64x@Estado.pressionadoy-1
Exigir[@ULTIMO]
SetVarInSd32xEvento.tipoy@EVENTO_MOUSE
SetVarInSd32xEvento.xy20
ChamarxUIAtualizar[@Itens,@Estado,@Evento]
SetVarInSd32xEvento.tipoy@EVENTO_PERDER_FOCO
ChamarxUIAtualizar[@Itens,@Estado,@Evento]
SetVarInSd32xEvento.tipoy@EVENTO_MOUSE_MOVER
SetVarInSd32xEvento.xy80
ChamarxUIAtualizar[@Itens,@Estado,@Evento]
CompararIgualxyFl64xItens@2.valory0.2
Exigir[@ULTIMO]
GerarTxtxl'OK'`;
  const r=execute(source,{optimize,modules:loadModules(source,'case.tom')});assert.equal(r.status,0,r.stdout);assert.equal(r.stdout,'OK');
});
