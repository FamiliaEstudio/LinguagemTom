'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {execute,command}=require('./helpers'),{loadModules}=require('../core/module-loader');
const {toolchain,linkArguments,copyAssets}=require('../core/native-build');
const eq=(a,b,t='Fl64')=>`CompararIgualxy${t}x${a}y${b}\nExigir[@ULTIMO]\n`;
for(const optimize of ['-O0','-O2']){
 test(`visual: cores, curvas, horários extremos e partículas ${optimize}`,()=>{
 const source=`Importar[l'tom/efeitos']
ChamarxCorRGBA[18,52,86,120]
${eq('@ULTIMO',305419896,'InUd32')}
ChamarxCorMisturar[255,4294967295,0.5]
${eq('@ULTIMO',2155905279,'InUd32')}
ChamarxCorOpacidade[305419896,0.5]
${eq('@ULTIMO',305419836,'InUd32')}
ChamarxAnimacaoInterpolar[0.0,10.0,100,100,150,@AnimacaoCurva.Suave]
${eq('@ULTIMO','5.0')}
ChamarxAnimacaoInterpolar[0.0,8.0,100,100,150,@AnimacaoCurva.Desacelerar]
${eq('@ULTIMO','7.0')}
ChamarxAnimacaoProgresso[-9223372036854775808,9223372036854775807,9223372036854775807]
${eq('@ULTIMO','1.0')}
ChamarxAnimacaoProgresso[9223372036854775800,100,9223372036854775807]
${eq('@ULTIMO','0.07')}
DefVarBlxFalhouyFalso
Tentar
ChamarxCorRGBA[256,0,0,0]
CapturarxErro
SetVarBlxFalhouyVerdadeiro
FimTentar
Exigir[@Falhou]
DefArraySoAxParticulasxEfeitoParticulax2
ChamarxEfeitoEmitir[@Particulas,0,1000000000,10.0,20.0,30.0,-10.0,2.0,4294967295]
${eq('@ULTIMO',0,'InSd64')}
ChamarxEfeitoEmitir[@Particulas,1,1000000000,0.0,0.0,0.0,0.0,2.0,4294967295]
${eq('@ULTIMO',1,'InSd64')}
ChamarxEfeitoEmitir[@Particulas,2,1000000000,0.0,0.0,0.0,0.0,2.0,4294967295]
${eq('@ULTIMO',0,'InSd64')}
// O mesmo instante é independente dos instantes anteriormente consultados.
ParaxFps[30,145,1]
ParaxFrame[0,@Fps,1]
MultiplicarDividirInSd64[@Frame,1000000000,@Fps]
ChamarxEfeitoPosicao[10.0,30.0,0,1000000000,@ULTIMO]
FimPara
ChamarxEfeitoPosicao[10.0,30.0,0,1000000000,500000000]
${eq('@ULTIMO','25.0')}
FimPara
ChamarxEfeitoLimpar[@Particulas]
NaoBlxParticulas@0.ativa
Exigir[@ULTIMO]
GerarTxtxl'OK'`;
 const r=execute(source,{optimize,modules:loadModules(source,'case.tom')});assert.equal(r.status,0,r.stdout+r.stderr);assert.equal(r.stdout,'OK');
 });
 test(`visual: pixels, identidade, recorte, limites e recursos SDL ${optimize}`,()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'tom-visual-'));
 try{const exe=path.join(dir,process.platform==='win32'?'test.exe':'test');command(toolchain().clang,[optimize,'-Wall','-Wextra','-Werror','-I',path.join(__dirname,'../runtime/stable'),path.join(__dirname,'visual-runtime.c'),...linkArguments(['ui']),'-o',exe]);copyAssets(dir,['ui']);const r=command(exe,[],{env:{...process.env,SDL_VIDEODRIVER:'dummy',SDL_RENDER_DRIVER:'software'}});assert.equal(r.stdout.trim(),'visual-runtime-ok');}
 finally{fs.rmSync(dir,{recursive:true,force:true,maxRetries:10,retryDelay:100});}
 });
}

for(const optimize of ['-O0','-O2'])test(`visual: tema opt-in, interrupção da transição e movimento reduzido ${optimize}`,()=>{
 const source=`Importar[l'tom/ui']
DefRecursoxJanelayJanelaCriar[l'Tema',320,200]
DefRecursoxFonteyFonteCarregar[18]
DefRecursoxCatalogoyCatalogoVisualCriar[@Janela,1]
DefArraySoAxItensxUIComponentex1
DefArraySoAxTransicoesxUITransicaox1
DefVarRegistro<UIEstado>xEstadoyPadrao
ChamarxUIInicializar[@Estado]
ChamarxUITemaClaro[]
DefVarRegistro<UITema>xTemay@ULTIMO
SetVarBlxItens@0.visivelyVerdadeiro
SetVarBlxItens@0.habilitadoyVerdadeiro
SetVarInSd32xItens@0.larguray150
SetVarInSd32xItens@0.alturay44
SetVarEnum<UIControle>xItens@0.tipoy@UIControle.Botao
CatalogoVisualTexto[@Catalogo,@Fonte,l'Tema']
SetVarInSd64xItens@0.visualy@ULTIMO
ChamarxUIDesenharTema[@Janela,@Catalogo,@Itens,@Estado,@Transicoes,@Tema,0,Falso]
NaoBlx@ULTIMO
Exigir[@ULTIMO]
SetVarInSd64xEstado.sobrey0
ChamarxUIDesenharTema[@Janela,@Catalogo,@Itens,@Estado,@Transicoes,@Tema,100000000,Falso]
Exigir[@ULTIMO]
ChamarxUIDesenharTema[@Janela,@Catalogo,@Itens,@Estado,@Transicoes,@Tema,170000000,Falso]
Exigir[@ULTIMO]
SetVarInSd64xEstado.pressionadoy0
ChamarxUIDesenharTema[@Janela,@Catalogo,@Itens,@Estado,@Transicoes,@Tema,170000000,Falso]
Exigir[@ULTIMO]
ChamarxCorMisturar[@Tema.fundo,@Tema.sobre,0.5]
${eq('@ULTIMO','Transicoes@0.de','InUd32')}
ChamarxUIDesenharTema[@Janela,@Catalogo,@Itens,@Estado,@Transicoes,@Tema,310000000,Falso]
NaoBlx@ULTIMO
Exigir[@ULTIMO]
SetVarInSd64xEstado.pressionadoy-1
ChamarxUIDesenharTema[@Janela,@Catalogo,@Itens,@Estado,@Transicoes,@Tema,311000000,Verdadeiro]
NaoBlx@ULTIMO
Exigir[@ULTIMO]
${eq('Transicoes@0.de','@Tema.sobre','InUd32')}
// A entrada e o desenho anterior permanecem disponíveis.
ChamarxUIDesenhar[@Janela,@Catalogo,@Itens,@Estado]
GerarTxtxl'OK'`;
 const r=execute(source,{optimize,modules:loadModules(source,'case.tom'),events:'',maximumLiveObjects:8,environment:{SDL_VIDEODRIVER:'dummy',SDL_RENDER_DRIVER:'software'}});assert.equal(r.status,0,r.stdout+r.stderr);assert.equal(r.stdout,'OK');
});

test('visual: ABI, snippets e diagnósticos usam o contrato do compilador',()=>{
 const {compileResolved}=require('../core/module-loader'),snippets=require('../snippets.json');
 const expand=body=>body.join('\n').replace(/\$\{\d+:([^{}]*)\}/g,'$1').replace(/\$\d+/g,'');
 const prefix="DefRecursoxJanelayJanelaCriar[l'Tom',320,200]\nDefRecursoxFonteyFonteCarregar[20]\nDefRecursoxVisualyVisualTextoCriar[@Janela,@Fonte,l'Tom']\nDefVarInSd64xInicioy0\nDefVarInSd64xAgoray100000000\n";
 for(const name of ['Visual transformado','Painel arredondado','Animação por tempo']){
  const r=compileResolved(prefix+expand(snippets[name].body));assert.equal(r.success,true,JSON.stringify(r.diagnostics));
 }
 const invalid=compileResolved(prefix+'DesenharVisualTransformado[@Janela,@Visual,0.0,0.0,Verdadeiro,1.0,0.0,4294967295]');assert.equal(invalid.success,false);assert.deepEqual(invalid.artifacts,{});
 assert.ok(invalid.diagnostics[0].location || invalid.diagnostics[0].line);
});
