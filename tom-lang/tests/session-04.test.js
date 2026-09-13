'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const {execute,rejection}=require('./helpers');const {loadModules}=require('../core/module-loader');
for(const optimize of ['-O0','-O2'])test(`0.4 sessão: pausa, eventos atrasados, prazos e calibração ${optimize}`,()=>{
  const source=`Importar[l'tom/sessao']
DefVarRegistro<SessaoEstado>xEstadoyPadrao
DefVarRegistro<RelogioAudio>xRelogioyPadrao
SetVarBlxRelogio.pausadoyVerdadeiro
DefArraySoAxHistoricoxSessaoTrechox8
ChamarxSessaoConfiguracaoPadrao[]
DefVarRegistro<SessaoConfiguracao>xConfiguracaoy@ULTIMO
SetVarInSd64xConfiguracao.contagemy0
ChamarxSessaoIniciar[@Estado,@Historico,@Configuracao,@Relogio,0]
SetVarBlxRelogio.pausadoyFalso
ChamarxSessaoAtualizar[@Estado,@Historico,@Relogio,0]
SetVarInSd64xRelogio.posicaoy48000
SetVarBlxRelogio.pausadoyVerdadeiro
ChamarxSessaoAtualizar[@Estado,@Historico,@Relogio,1000000000]
ChamarxSessaoEventoAmostra[@Estado,@Historico,500000000]
CompararIgualxyInSd64x@ULTIMOy24000
Exigir[@ULTIMO]
ChamarxSessaoAtualizar[@Estado,@Historico,@Relogio,2000000000]
ChamarxSessaoEventoAmostra[@Estado,@Historico,1500000000]
CompararIgualxyInSd64x@ULTIMOy48000
Exigir[@ULTIMO]
SetVarBlxRelogio.pausadoyFalso
SetVarInSd64xRelogio.ancoraAmostray48000
SetVarInSd64xRelogio.ancoraNsy2000000000
ChamarxSessaoAtualizar[@Estado,@Historico,@Relogio,2000000000]
SetVarInSd64xRelogio.posicaoy72000
ChamarxSessaoAtualizar[@Estado,@Historico,@Relogio,2500000000]
ChamarxSessaoEventoAmostra[@Estado,@Historico,2250000000]
CompararIgualxyInSd64x@ULTIMOy60000
Exigir[@ULTIMO]
ChamarxSessaoEventoAmostra[@Estado,@Historico,500000000]
CompararIgualxyInSd64x@ULTIMOy24000
Exigir[@ULTIMO]
ChamarxSessaoPrazoAmostra[@Estado,1000000000,1,3]
CompararIgualxyInSd64x@ULTIMOy8000000000000
Exigir[@ULTIMO]
MultiplicarDividirInSd64[9223372036854775807,9223372036854775807,9223372036854775807]
CompararIgualxyInSd64x@ULTIMOy9223372036854775807
Exigir[@ULTIMO]
DefVarRegistro<CalibracaoBatidas>xBatidasyPadrao
ChamarxCalibracaoAdicionar[@Batidas,1000000000,1010000000]
ChamarxCalibracaoAdicionar[@Batidas,2000000000,2030000000]
ChamarxCalibracaoEstimar[@Batidas]
CompararIgualxyInSd64x@ULTIMOy20000000
Exigir[@ULTIMO]
DefRecursoxDocyJsonCriar[1048576]
ChamarxSessaoConfiguracaoGravar[@Configuracao,@Doc]
DefVarRegistro<SessaoConfiguracao>xCopiayPadrao
ChamarxSessaoConfiguracaoLer[@Doc,@Copia]
CompararIgualxyInUd64x@Copia.sementey42
Exigir[@ULTIMO]
JsonDefinirInSd64[@Doc,l'/versao',2]
Tentar
ChamarxSessaoConfiguracaoLer[@Doc,@Copia]
CapturarxErro
CompararIgualxyInSd64x@Copia.bpmy120
Exigir[@ULTIMO]
FimTentar
GerarTxtxl'OK'`;
  const r=execute(source,{optimize,modules:loadModules(source,'case.tom')});assert.equal(r.status,0,r.stdout);assert.equal(r.stdout,'OK');
});
test('0.4 ABI rejeita um registro de relógio com layout incompatível',()=>{
  rejection('DefRegistroxRelogioAudio\nPropInSd32xerrado\nFimDef\nDefRecursoxAyAudioCriar[]\nDefVarRegistro<RelogioAudio>xRyPadrao\nAudioRelogioLer[@A,@R]','E_ABI');
});
