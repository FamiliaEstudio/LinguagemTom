'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {execute}=require('../../../tom-lang/tests/helpers'),{loadModules}=require('../../../tom-lang/core/module-loader');
const file=path.resolve(__dirname,'../src/musical-tom.tom');
const full=fs.readFileSync(file,'utf8'),initial=full.slice(0,full.indexOf('DefStkFB512CxMensagem'));
for(const optimize of ['-O0','-O2'])test(`musical visual: capturas de acerto, movimento reduzido e conquista ${optimize}`,()=>{
 const out=path.resolve(__dirname,'../build/visual',process.platform,optimize.slice(1));fs.mkdirSync(out,{recursive:true});
 for(const reduced of [false,true]){
 const source=initial+`
DefArraySoAxEfeitosxJogoEfeitox20
DefArraySoAxParticulasxEfeitoParticulax128
DefArraySoAxHistoricoVisualxSessaoTrechox16
DefRecursoxDecoracaoySorteadorCriar[42,91]
DefVarRegistro<RelogioAudio>xRelogioVisualyPadrao
SetVarBlxRelogioVisual.pausadoyVerdadeiro
SetVarInSd64xRelogioVisual.ancoraNsy1000000000
SetVarInSd32xPerfil.config.modoy2
SetVarInSd32xPerfil.config.clavey1
SetVarBlxPerfil.config.acidentesyVerdadeiro
SetVarBlxPerfil.config.reduzirMovimentoy${reduced?'Verdadeiro':'Falso'}
ChamarxJogoIniciar[@Estado,@Notas,@HistoricoVisual,@Perfil.config,@RelogioVisual,1000000000,42,1]
DefVarInSd64xAlvoyNotas@0.alvo
ChamarxJogoResponder[@Estado,@Notas,Notas@0.letra,Notas@0.alteracao,Falso,@Alvo]
ChamarxJogoVisualObservar[@Estado,@Notas,@Efeitos,@Particulas,@Decoracao,@Alvo,Verdadeiro]
SomarxyInSd64x@Alvoy10800
DefVarInSd64xAmostray@ULTIMO
MultiplicarDividirInSd64[@Amostra,1000000000,48000]
DefVarInSd64xEfeitoAgoray@ULTIMO
ChamarxJogoMontarTela[@Catalogo,@Fonte,@Itens,@Interface,@Linhas,1]
ChamarxJogoLinha[@Catalogo,@Fonte,@Linhas,0,l'RITMO · teste visual em fá']
ChamarxJogoLinha[@Catalogo,@Fonte,@Linhas,2,l'✓ Preciso! +10 · símbolos e pontuação permanecem explícitos.']
ChamarxJogoDesenharBase[@Janela,@Catalogo,@Visuais,@Linhas,@Itens,@Interface,1,@Transicoes,@Tema,@EfeitoAgora,@Perfil.config.reduzirMovimento]
ChamarxJogoDesenharPauta[@Janela,@Catalogo,@Visuais,@Estado,@Notas,@Amostra,@Efeitos,@EfeitoAgora]
ChamarxJogoEfeitosFrente[@Janela,@Catalogo,@Visuais,@Efeitos,@Particulas,@Estado,@Amostra,@EfeitoAgora]
JanelaApresentar[@Janela]
CompararIgualxyInSd64x@Estado.pontosy10
Exigir[@ULTIMO]
EscopoFimxAplicacao
GerarTxtxl'OK'`;
 const snapshot=path.join(out,reduced?'reduzido.bmp':'normal.bmp');
 const r=execute(source,{file,modules:loadModules(source,file),optimize,events:'',snapshot,maximumLiveObjects:128,environment:{SDL_VIDEODRIVER:'dummy',SDL_RENDER_DRIVER:'software',SDL_AUDIODRIVER:'dummy'}});
 assert.equal(r.status,0,r.stdout+r.stderr);assert.equal(r.stdout,'OK');assert.ok(r.trace.includes('Preciso!'));assert.ok(fs.statSync(snapshot).size>100000);
 }
 assert.notDeepEqual(fs.readFileSync(path.join(out,'normal.bmp')),fs.readFileSync(path.join(out,'reduzido.bmp')));
 const source=initial+`
SetVarInSd64xEstado.pontosy200
ChamarxJogoMontarTela[@Catalogo,@Fonte,@Itens,@Interface,@Linhas,2]
ChamarxJogoLinha[@Catalogo,@Fonte,@Linhas,0,l'Rodada concluída · novos caminhos para aprender']
CatalogoVisualSubstituir[@Catalogo,@Visuais.conquista,@Fonte,l'Clave de fá liberada']
ChamarxJogoDesenharBase[@Janela,@Catalogo,@Visuais,@Linhas,@Itens,@Interface,2,@Transicoes,@Tema,450000000,Falso]
ChamarxJogoResultadoVisual[@Janela,@Catalogo,@Visuais,@Digitos,@Estado,0,450000000,Falso,1]
JanelaApresentar[@Janela]
EscopoFimxAplicacao
GerarTxtxl'OK'`;
 const r=execute(source,{file,modules:loadModules(source,file),optimize,events:'',snapshot:path.join(out,'conquista.bmp'),maximumLiveObjects:128,environment:{SDL_VIDEODRIVER:'dummy',SDL_RENDER_DRIVER:'software'}});assert.equal(r.status,0,r.stdout+r.stderr);assert.equal(r.stdout,'OK');
});
