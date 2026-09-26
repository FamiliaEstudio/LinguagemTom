'use strict';
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../../..');
const {compileResolved}=require(path.join(root,'tom-lang/core/module-loader'));
const {buildApplication}=require(path.join(root,'tom-lang/core/native-build'));
function build({optimize='-O2',testUI=false,bundle=true,isolation=''}={}){
  const file=path.join(__dirname,'../src/companion.tom'),source=fs.readFileSync(file,'utf8');
  const compilation=compileResolved(source,{file});if(!compilation.success)throw Error(JSON.stringify(compilation.diagnostics));
  if(testUI)compilation.artifacts.llvm=compilation.artifacts.llvm.replace('define i32 @main()','define i32 @tom_companion_program()')+`
declare i64 @tom_live_objects()
define i32 @main() {
entry:
  %status = call i32 @tom_companion_program()
  %live = call i64 @tom_live_objects()
  %clean = icmp eq i64 %live, 0
  %result = select i1 %clean, i32 %status, i32 91
  ret i32 %result
}
`;
  const parent=path.join(__dirname,'../build',process.platform,(testUI?'test'+optimize.slice(1):optimize.slice(1))+(isolation?'-'+isolation:''));
  const executable=buildApplication(compilation,file,parent,{optimize,testUI});
  const directory=path.dirname(executable);
  if(bundle){
    const mapExecutable=require('./build-map').buildMap({optimize,testUI,outDir:directory});
    const {buildHeadless}=require('./build-headless');
    const headlessExecutable=buildHeadless({optimize,outDir:directory});
    const headlessMapExecutable=buildHeadless({kind:'mapa',optimize,outDir:directory});
    const support=path.join(directory,'support');
    for(const name of ['tom-lang/core','tom-lang/runtime/stable','tom-lang/stdlib','tom-lang/companion','scripts','aplicativos/tom-companion/src','aplicativos/tom-companion/courses','aplicativos/tom-companion/scripts','aplicativos/tom-companion/validacao']){
      fs.cpSync(path.join(root,name),path.join(support,name),{recursive:true});
    }
    for(const name of ['tom-lang/package.json','tom-lang/tomc.js','tom-lang/exemplos/calculadora.tom','tom-lang/docs/companion-api.md','tom-lang/docs/integrated-views.md','tom-lang/docs/core-language.md','benchmarks/calculator/workload.js','aplicativos/tom-companion/README.md','aplicativos/tom-companion/VALIDACAO.md','aplicativos/tom-companion/DISTRIBUICAO.md']){fs.mkdirSync(path.dirname(path.join(support,name)),{recursive:true});fs.copyFileSync(path.join(root,name),path.join(support,name));}
    fs.copyFileSync(path.join(__dirname,'../DISTRIBUICAO.md'),path.join(directory,'LEIA-ME.md'));
    fs.copyFileSync(path.join(__dirname,'../MAPA.md'),path.join(directory,'MAPA.md'));
    fs.copyFileSync(path.join(root,'tom-lang/docs/code-map.md'),path.join(support,'tom-lang/docs/code-map.md'));
    fs.copyFileSync(path.join(__dirname,'../MAPA.md'),path.join(support,'aplicativos/tom-companion/MAPA.md'));
    fs.writeFileSync(path.join(directory,'companion-install.json'),JSON.stringify({version:'0.1.0',protocol:1,executable:path.basename(executable),mapExecutable:path.relative(directory,mapExecutable),headlessExecutable:path.relative(directory,headlessExecutable),headlessMapExecutable:path.relative(directory,headlessMapExecutable),capabilities:['graph-v1','ack-chunks','companion-view-v1','graph-view-v1'],support:'support',platform:process.platform,optimize},null,2)+'\n');
  }
  return executable;
}
if(require.main===module)console.log(build({optimize:process.argv.includes('--O0')?'-O0':'-O2',testUI:process.argv.includes('--test'),bundle:!process.argv.includes('--no-bundle')}));
module.exports={build};
