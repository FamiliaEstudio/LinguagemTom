'use strict';
const fs=require('node:fs'),path=require('node:path'),test=require('node:test'),assert=require('node:assert/strict'),{spawnSync}=require('node:child_process');
const {build,app}=require('../scripts/build');
for(const optimize of ['-O0','-O2'])test(`musical: cem entradas/saídas da rodada com janela, visuais, WAV e áudio ${optimize}`,()=>{
 const original=fs.readFileSync(path.join(app,'src/musical-tom.tom'),'utf8');
 const source=original.slice(0,original.indexOf('DefStkFB512CxMensagem'))+`
ParaxCiclo[0,100,1]
ChamarxJogoJogar[@Janela,@Fonte,@Catalogo,@Visuais,@Linhas,@Itens,@Interface,@Estado,@Notas,@Vinculos,@Acoes,@Perfil.config,42,1]
CompararIgualxyInSd32x@ULTIMOy9
Exigir[@ULTIMO]
FimPara
EscopoFimxAplicacao
GerarTxtxl'OK'
`;
 const output=path.join(app,'build','cycles',process.platform,optimize.slice(1));
 const bin=build({source,output,optimize,testUI:true,leaks:true});
 const events=path.join(output,'quit.events');fs.writeFileSync(events,'quit\n'.repeat(100));
 const result=spawnSync(bin,[],{env:{...process.env,SDL_VIDEODRIVER:'dummy',SDL_AUDIODRIVER:'dummy',SDL_RENDER_DRIVER:'software',TOM_UI_EVENTS:events,TOM_DATA_DIRECTORY:path.join(output,'data')},encoding:'utf8',timeout:60000});
 assert.ifError(result.error);assert.equal(result.status,0,result.stdout+result.stderr);assert.equal(result.stdout,'OK');
});
