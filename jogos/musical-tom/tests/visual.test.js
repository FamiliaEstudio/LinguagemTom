'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {run,eq}=require('./helpers');
const baseline=require('./replay-fixture');
const {execute}=require('../../../tom-lang/tests/helpers'),{loadModules}=require('../../../tom-lang/core/module-loader');
for(const optimize of ['-O0','-O2']){
 test(`musical visual: replay normal, reduzido e sem decoração têm os mesmos julgamentos ${optimize}`,()=>{
 let source="Importar[l'../src/visual.tom']\n"+baseline;
 source=source.replace('InSd64xFps,BlxAtrasar]','InSd64xFps,BlxAtrasar,BlxReduzir,BlxDecorar]');
 source=source.replace('DefVarRegistro<JogoEstado>xModeloyPadrao',`DefVarRegistro<JogoEstado>xModeloyPadrao
DefArraySoAxEfeitosxJogoEfeitox20
DefArraySoAxParticulasxEfeitoParticulax128
DefRecursoxDecoracaoySorteadorCriar[42,91]`);
 source=source.replace('SetVarInSd32xConfigLocal.modoy2','SetVarInSd32xConfigLocal.modoy2\nSetVarBlxConfigLocal.reduzirMovimentoy@Reduzir');
 const observe='\nChamarxJogoVisualObservar[@Modelo,@Exercicios,@Efeitos,@Particulas,@Decoracao,@Clock.posicao,@Decorar]';
 source=source.replace('ChamarxJogoEntrada[@Modelo,@Exercicios,@Trechos,@Associacoes,@Actions,@Input,@Clock,@Gravacao.momentoNs]', 'ChamarxJogoEntrada[@Modelo,@Exercicios,@Trechos,@Associacoes,@Actions,@Input,@Clock,@Gravacao.momentoNs]'+observe);
 source=source.replace('ChamarxJogoExpirar[@Modelo,@Exercicios,@Clock.posicao]','ChamarxJogoExpirar[@Modelo,@Exercicios,@Clock.posicao]'+observe);
 source=source.replace('Retornarx@Result',`ParaIndiceSOAxI[@Efeitos]
Exigir[Efeitos@@I.acerto]
FimPara
NaoBlx@Decorar
OuxyBlx@ULTIMOy@Reduzir
Sex@ULTIMO
ParaIndiceSOAxI[@Particulas]
NaoBlxParticulas@@I.ativa
Exigir[@ULTIMO]
FimPara
FimSe
Retornarx@Result`);
 source=source.replaceAll('TesteReproduzir[30,Falso]','TesteReproduzir[30,Falso,Falso,Verdadeiro]').replaceAll('TesteReproduzir[60,Verdadeiro]','TesteReproduzir[60,Verdadeiro,Falso,Verdadeiro]').replaceAll('TesteReproduzir[144,Verdadeiro]','TesteReproduzir[144,Verdadeiro,Falso,Verdadeiro]');
 for(const [name,reduced,enabled]of[['Reduzido','Verdadeiro','Verdadeiro'],['Desligado','Falso','Falso']]){
  source+=`ChamarxTesteReproduzir[60,Verdadeiro,${reduced},${enabled}]\nDefVarRegistro<JogoReplayResultado>x${name}y@ULTIMO\n`;
  for(const f of ['pontos','acertos','comandos','checksum'])source+=eq('@R30.'+f,'@'+name+'.'+f);
 }
 run(source,optimize);
 });
 test(`musical visual: perfil antigo, preferência opcional, erro transacional e conquista ${optimize}`,()=>{
 const source=`Importar[l'../src/visual.tom']
DefArraySoAxAntesxJogoConquistax12
DefArraySoAxDepoisxJogoConquistax12
ChamarxJogoConquistas[@Perfil,@Dominios,@Antes]
SetVarInSd64xPerfil.pontosy400
SetVarInSd64xDominios@0.qualificadasy2
SetVarInSd64xDominios@0.rodadasy2
ChamarxJogoConquistas[@Perfil,@Dominios,@Depois]
NaoBlxAntes@0.liberada
Exigir[@ULTIMO]
Exigir[Depois@0.liberada]
SetVarBlxPerfil.config.reduzirMovimentoyVerdadeiro
DefRecursoxDocumentoyJsonCriar[4194304]
ChamarxJogoPerfilGravar[@Perfil,@Dominios,@Estatisticas,@Resultados,@Vinculos,@Documento]
JsonObterBl[@Documento,l'/config/reduzirMovimento']
Exigir[@ULTIMO]
SetVarBlxPerfil.config.reduzirMovimentoyFalso
ChamarxJogoPerfilLer[@Documento,@Perfil,@Dominios,@Estatisticas,@Resultados,@Vinculos]
Exigir[@Perfil.config.reduzirMovimento]
JsonDefinirTexto[@Documento,l'/config/reduzirMovimento',l'inválido']
DefVarBlxFalhouyFalso
Tentar
ChamarxJogoPerfilLer[@Documento,@Perfil,@Dominios,@Estatisticas,@Resultados,@Vinculos]
CapturarxErro
SetVarBlxFalhouyVerdadeiro
FimTentar
Exigir[@Falhou]
Exigir[@Perfil.config.reduzirMovimento]
${eq('@Perfil.pontos',400)}
`;
 run(source,optimize);
 // Remove the optional field from a valid serialized profile, as an older binary writes it.
 const file=path.resolve(__dirname,'old-profile.tom');
 const prefix=require('./helpers').prefix;
 const dump=prefix+`DefRecursoxJyJsonCriar[4194304]\nChamarxJogoPerfilGravar[@Perfil,@Dominios,@Estatisticas,@Resultados,@Vinculos,@J]\nDefStkFB1048576CxTextoyl''\nJsonEscrever[@J,@Texto]\nGerarTxtxTexto`;
 const r=execute(dump,{file,modules:loadModules(dump,file),optimize});assert.equal(r.status,0,r.stdout);
 const old=JSON.parse(r.stdout);delete old.config.reduzirMovimento;
 run(`DefRecursoxDocumentoyJsonLer[l'${JSON.stringify(old)}',4194304]\nSetVarBlxPerfil.config.reduzirMovimentoyVerdadeiro\nChamarxJogoPerfilLer[@Documento,@Perfil,@Dominios,@Estatisticas,@Resultados,@Vinculos]\nNaoBlx@Perfil.config.reduzirMovimento\nExigir[@ULTIMO]\n`,optimize);
 });
}
