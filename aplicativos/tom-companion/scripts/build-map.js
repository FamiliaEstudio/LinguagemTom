'use strict';
const fs=require('node:fs'),path=require('node:path');
const {compileResolved}=require('../../../tom-lang/core/module-loader');
const {buildApplication}=require('../../../tom-lang/core/native-build');
function buildMap({optimize='-O2',testUI=false,outDir}={}){
  const file=path.resolve(__dirname,'../src/mapa.tom'),c=compileResolved(fs.readFileSync(file,'utf8'),{file});if(!c.success)throw Error(JSON.stringify(c.diagnostics));
  if(testUI)c.artifacts.llvm=c.artifacts.llvm.replace('define i32 @main()','define i32 @tom_map_main()')+`
declare i64 @tom_live_objects()
define i32 @main() {
entry:
  %status = call i32 @tom_map_main()
  %live = call i64 @tom_live_objects()
  %clean = icmp eq i64 %live, 0
  %result = select i1 %clean, i32 %status, i32 91
  ret i32 %result
}
`;
  return buildApplication(c,file,outDir||path.resolve(__dirname,'../build/map',process.platform,(testUI?'test':'')+optimize.slice(1)),{optimize,testUI});
}
if(require.main===module)console.log(buildMap({optimize:process.argv.includes('--O0')?'-O0':'-O2',testUI:process.argv.includes('--test')}));
module.exports={buildMap};
