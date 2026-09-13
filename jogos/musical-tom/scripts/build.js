'use strict';
const fs=require('node:fs'),path=require('node:path');
const {compileResolved}=require('../../../tom-lang/core/module-loader');
const {buildApplication}=require('../../../tom-lang/core/native-build');
const app=path.resolve(__dirname,'..');
function build({optimize='-O2',testUI=false,output,leaks=false,source}={}){
 const file=path.join(app,'src/musical-tom.tom'),result=compileResolved(source===undefined?fs.readFileSync(file,'utf8'):source,{file});
 if(!result.success)throw Error(JSON.stringify(result.diagnostics));
 if(leaks)result.artifacts.llvm=result.artifacts.llvm.replace('define i32 @main()','define i32 @tom_program_main()')+`
declare i64 @tom_live_objects()
declare i64 @tom_peak_objects()
define i32 @main() {
 %status = call i32 @tom_program_main()
 %live = call i64 @tom_live_objects()
 %peak = call i64 @tom_peak_objects()
 %leaked = icmp ne i64 %live, 0
 %grew = icmp ugt i64 %peak, 256
 %bad = or i1 %leaked, %grew
 %exit = select i1 %bad, i32 91, i32 %status
 ret i32 %exit
}
`;
 const bin=buildApplication(result,file,output||path.join(app,'build',process.platform==='win32'?'windows':'linux',optimize.slice(1)),{optimize,testUI,assets:path.join(app,'assets')});
 fs.writeFileSync(path.join(path.dirname(bin),'musical-tom.json'),JSON.stringify({name:'Musical Tom',version:'0.1.0',language:'0.4',optimize,testUI},null,2)+'\n');
 fs.copyFileSync(path.join(app,'assets/LEIA-ME.txt'),path.join(path.dirname(bin),'LEIA-ME.txt'));
 return bin;
}
if(require.main===module){try{console.log(build({optimize:process.argv.includes('--O0')?'-O0':'-O2'}));}catch(e){console.error(e.stack);process.exitCode=1;}}
module.exports={build,app};
