'use strict';
const fs=require('node:fs'),path=require('node:path');
const {compileResolved}=require('../../../tom-lang/core/module-loader');
const {buildApplication}=require('../../../tom-lang/core/native-build');
function buildHeadless({kind='companion',optimize='-O2',outDir}={}){
  if(!['companion','mapa'].includes(kind))throw Error('Entrada sem janela inválida.');
  const file=path.resolve(__dirname,'../src',kind+'-headless.tom');
  const compilation=compileResolved(fs.readFileSync(file,'utf8'),{file});
  if(!compilation.success)throw Error(JSON.stringify(compilation.diagnostics));
  if(compilation.artifacts.runtimeRequirements.includes('ui'))throw Error('O processo integrado não pode depender de janelas.');
  return buildApplication(compilation,file,outDir||path.resolve(__dirname,'../build/headless',process.platform,optimize.slice(1)),{optimize});
}
if(require.main===module)for(const kind of ['companion','mapa'])console.log(buildHeadless({kind}));
module.exports={buildHeadless};
