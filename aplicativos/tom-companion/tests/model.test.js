'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {execute}=require('../../../tom-lang/tests/helpers');
const {loadModules}=require('../../../tom-lang/core/module-loader');
const {defaults}=require('../../../tom-lang/companion/session');
const course=require('../courses/calculadora/roteiro.json');
const literal=JSON.stringify({course,progress:defaults(course)}).replace(/\\/g,'\\\\').replace(/'/g,"\\'");
const check=(type,operand,value)=>`CompararIgualxy${type}x${operand}y${value}\nExigir[@ULTIMO]\n`;
const action=n=>`ChamarxCompanionAcao[@Estado,@Dados,${n},@Resultado]\n`;
let source=`Importar[l'./acoes.tom']\nDefVarRegistro<CompanionEstado>xEstadoyPadrao\nDefRecursoxDadosyJsonLer[l'${literal}',8388608]\nDefStkFB65536CxResultadoyl''\nSetVarBlxEstado.iniciadoyVerdadeiro\nSetVarBlxEstado.conectadoyVerdadeiro\n`;
source+=action(2)+check('InSd64','@Estado.passo',0)+'SetVarBlxEstado.aprovadoyVerdadeiro\n'+action(2)+check('InSd64','@ULTIMO',10)+check('InSd64','@Estado.passo',1)+'NaoBlx@Estado.aprovado\nExigir[@ULTIMO]\n';
source+=action(29)+check('InSd64','@ULTIMO',29)+check('InSd64','@Estado.dica',3)+action(4).repeat(4)+check('InSd64','@Estado.dica',3)+action(29)+check('InSd64','@ULTIMO',29)+action(5)+check('InSd64','@Estado.dica',0)+action(29)+check('InSd64','@ULTIMO',29)+check('InSd64','@Estado.dica',3)+"JsonObterInSd64[@Dados,l'/progress/hints/1']\n"+check('InSd64','@ULTIMO',3);
source+=action(11).repeat(3)+check('InSd32','@Estado.fonte',0)+'SetVarInSd64xEstado.paginasPassoy3\n'+action(21).repeat(6)+check('InSd64','@Estado.paginaPasso',2)+action(20).repeat(6)+check('InSd64','@Estado.paginaPasso',0)+"GerarTxtxl'OK'";
for(const optimize of ['-O0','-O2'])test(`Tom owns manual progression, hints, pagination and font preference ${optimize}`,()=>{
  const file=path.join(__dirname,'../src/teste-modelo.tom'),modules=loadModules(source,file);
  const result=execute(source,{file,modules,optimize,maximumLiveObjects:12});assert.equal(result.status,0,result.stdout+result.stderr);assert.equal(result.stdout,'OK');
});
