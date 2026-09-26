'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {execute,rejection}=require('./helpers');
const echo=`DefRecursoxCanalyCanalMensagensAbrir[1024,8]
DefStkFB1025CxMensag emyl''`.replace('Mensag em','Mensagem')+`
DefVarBlxAguardaryVerdadeiro
TempoAgoraNs[]
SomarxyInSd64x@ULTIMOy2000000000
DefVarInSd64xLimitey@ULTIMO
Enquantox@Aguardar
CanalMensagensConsultar[@Canal,@Mensagem]
Sex@ULTIMO
CanalMensagensEnviar[@Canal,@Mensagem]
SetVarBlxAguardaryFalso
FimSe
TempoAgoraNs[]
CompararMenorxyInSd64x@ULTIMOy@Limite
Exigir[@ULTIMO]
FimEnquanto`;
for(const optimize of ['-O0','-O2'])test(`message channel UTF-8, percent and lexical cleanup ${optimize}`,()=>{
  const text='{"texto":"Olá 🐈 %", "inteiro":"9007199254740993"}';
  const r=execute(echo,{input:text+'\n',optimize,maximumLiveObjects:2});assert.equal(r.status,0,r.stdout+r.stderr);assert.equal(r.stdout,text+'\n');
});
test('message channels require mutable borrowing for send and receive',()=>{
  rejection("DefFuncaoxF[CanalMensagensxC]yVazio\nCanalMensagensEnviar[@C,l'{}']\nFimFuncao",'E_BORROW');
});
for(const optimize of ['-O0','-O2'])test(`message channel detects incomplete input and capacity before mutation ${optimize}`,()=>{
  for(const input of ['incomplete','x'.repeat(1025)+'\n',Buffer.from([0xff,10])]){
    const r=execute('Tentar\n'+echo+"\nCapturarxErro\nGerarTxtxl'CAPTURADO'\nFimTentar",{input,optimize,maximumLiveObjects:2});
    assert.equal(r.status,0,r.stdout+r.stderr);assert.equal(r.stdout,'CAPTURADO');
  }
});

for(const optimize of ['-O0','-O2'])test(`waiting channel builtin borrows and receives without a window ${optimize}`,()=>{
 const source=`DefRecursoxCanalyCanalMensagensAbrir[1024,8]
DefStkFB1025CxMensagemyl'preservado'
TempoAgoraNs[]
SomarxyInSd64x@ULTIMOy2000000000
CanalMensagensAguardarAte[@Canal,@Mensagem,@ULTIMO]
Exigir[@ULTIMO]
CanalMensagensEnviar[@Canal,@Mensagem]`;
 const r=execute(source,{input:'Olá 🐈\n',optimize,maximumLiveObjects:2,environment:{DISPLAY:'',WAYLAND_DISPLAY:'',SDL_VIDEODRIVER:'invalid'}});
 assert.equal(r.status,0,r.stdout+r.stderr);assert.equal(r.stdout,'Olá 🐈\n');
 rejection('DefFuncaoxF[CanalMensagensxC,RefFB32CxB]yVazio\nCanalMensagensAguardarAte[@C,@B,0]\nFimFuncao','E_BORROW');
});
