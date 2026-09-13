'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
const {execute}=require('./helpers');const {loadModules}=require('../core/module-loader');
for(const optimize of ['-O0','-O2'])test(`0.4 replay: JSON, relógios exatos, 30/60/144 FPS e travamentos ${optimize}`,()=>{
 const file=path.join(__dirname,'fixtures/replay-04.tom'),source=fs.readFileSync(file,'utf8');
 const r=execute(source,{file,optimize,modules:loadModules(source,file),maximumLiveObjects:32});
 assert.equal(r.status,0,r.stdout);assert.equal(r.stdout,'OK');
});

for (const optimize of ['-O0','-O2']) test(`0.4 laboratório: mesma atualização da janela, comandos e projeção a 30/60/144 FPS ${optimize}`,()=>{
 const file=path.join(__dirname,'fixtures/replay-04.tom');
 let source=fs.readFileSync(file,'utf8');
 source=source.replace("Importar[l'tom/replay']", "Importar[l'../../exemplos/estado/laboratorio-core.tom']");
 source=source.replace('DefArraySoAxVinculosxEntradaVinculox1', `DefVarRegistro<LaboratorioEstado>xModeloyPadrao
DefArraySoAxItensxUIComponentex15
DefArraySoAxTonsxLaboratorioTomx7
DefVarInSd64xComandosy0
DefArraySoAxVinculosxEntradaVinculox1`);
 source=source.replace('ChamarxSessaoIniciar[@Sessao,@Historico,@Config,@Relogio,@Gravacao.origemNs]', 'ChamarxLaboratorioPreparar[@Modelo,@Historico,@Vinculos,@Acoes,@Config,@Relogio,@Gravacao.origemNs]');
 source=source.replace('ChamarxSessaoAtualizar[@Sessao,@Historico,@Relogio,@Gravacao.momentoNs]\nChamarxEntradaAtualizar[@Vinculos,@Acoes,@Evento]', `ChamarxLaboratorioAtualizar[@Modelo,@Historico,@Vinculos,@Acoes,@Itens,@Tons,@Evento,@Relogio,@Gravacao.momentoNs]
DefVarBlxSolicitadoyTons@0.solicitado
Sex@Solicitado
SomarxyInSd64x@Comandosy1
SetVarInSd64xComandosy@ULTIMO
CompararMaiorxyFl64xTons@0.frequenciay261.0
Exigir[@ULTIMO]
CompararMenorxyFl64xTons@0.frequenciay263.0
Exigir[@ULTIMO]
FimSe`);
 source=source.replace('ChamarxSessaoEventoAmostra[@Sessao,@Historico,@Evento.tempoNs]', 'ChamarxSessaoEventoAmostra[@Modelo.sessao,@Historico,@Evento.tempoNs]');
 source=source.replace('SomarxyInSd64x@Quadroy1', `SomarxyInSd64x@Gravacao.origemNsy@Prazo
ChamarxLaboratorioPosicaoVisual[@Relogio,@Config.calibracao,@ULTIMO]
SomarxyInSd64x@Quadroy1`);
 source=source.replace('Retornarx@Soma', `CompararIgualxyInSd64x@Comandosy3
Exigir[@ULTIMO]
CompararIgualxyInSd64x@Modelo.acoesy3
Exigir[@ULTIMO]
CompararIgualxyInSd64x@Modelo.ultimaAmostray60000
Exigir[@ULTIMO]
CompararIgualxyBlxAcoes@0.mantidayFalso
Exigir[@ULTIMO]
ChamarxLaboratorioPosicaoVisual[@Relogio,@Config.calibracao,9007202254740993]
CompararIgualxyInSd64x@ULTIMOy96000
Exigir[@ULTIMO]
Retornarx@Soma`);
 const r=execute(source,{file,optimize,modules:loadModules(source,file),maximumLiveObjects:32});
 assert.equal(r.status,0,r.stdout);assert.equal(r.stdout,'OK');
});
