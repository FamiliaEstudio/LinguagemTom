'use strict';
const assert=require('node:assert/strict'),path=require('node:path');
const {execute}=require('../../../tom-lang/tests/helpers');
const {loadModules}=require('../../../tom-lang/core/module-loader');
const file=path.resolve(__dirname,'case.tom');
const prefix=`Importar[l'../src/perfil.tom']
DefVarRegistro<JogoEstado>xEstadoyPadrao
DefVarRegistro<JogoPerfil>xPerfilyPadrao
DefVarRegistro<RelogioAudio>xRelogioyPadrao
SetVarBlxRelogio.pausadoyVerdadeiro
SetVarInSd64xRelogio.ancoraNsy1000000000
DefArraySoAxNotasxJogoNotax20
DefArraySoAxHistoricoxSessaoTrechox128
DefArraySoAxVinculosxEntradaVinculox9
DefArraySoAxAcoesxEntradaAcaox9
DefArraySoAxDominiosxJogoDominiox36
DefArraySoAxEstatisticasxJogoEstatisticax108
DefArraySoAxResultadosxJogoResultadox50
ChamarxJogoPerfilPadrao[@Perfil,@Vinculos]
ChamarxJogoPadrao[]
DefVarRegistro<JogoConfiguracao>xConfigy@ULTIMO
`;
const eq=(a,b,type='InSd64')=>`CompararIgualxy${type}x${a}y${b}\nExigir[@ULTIMO]\n`;
const start=`ChamarxJogoIniciar[@Estado,@Notas,@Historico,@Config,@Relogio,1000000000,42,1]\n`;
function run(body,optimize){const source=prefix+body+"GerarTxtxl'OK'";const r=execute(source,{file,modules:loadModules(source,file),optimize,maximumLiveObjects:64,environment:{SDL_AUDIODRIVER:'dummy'}});assert.equal(r.status,0,r.stdout+r.stderr);assert.equal(r.stdout,'OK');}
module.exports={prefix,eq,start,run};
