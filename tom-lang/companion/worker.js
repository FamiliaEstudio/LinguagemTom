'use strict';
const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto');
const {compile,analyze}=require('../core/compiler');
const {verify}=require('./verify');
const {buildApplication}=require('../core/native-build');
let input='';process.stdin.setEncoding('utf8');
process.stdin.on('data',chunk=>{input+=chunk;if(Buffer.byteLength(input)>1048576){process.stderr.write('Solicitação excede 1 MiB.');process.exit(1);}});
process.stdin.on('end',()=>{
  try{
    const request=JSON.parse(input),{source,file,root,op}=request;
    if(typeof source!=='string'||typeof file!=='string'||typeof root!=='string')throw Error('Solicitação inválida.');
    const hash=createHash('sha256').update(source).digest('hex');let result;
    if(op==='analyze')result=analyze(source,{file});
    else if(op==='verify')result=verify(root,source,request.step,{file,optimize:request.optimize||'-O0',temporaryDirectory:request.temporaryDirectory});
    else if(op==='build'){
      const compilation=compile(source,{file});
      result=compilation.success?{success:true,executable:buildApplication(compilation,file,request.outDir,{optimize:request.optimize||'-O0'})}:compilation;
      if(result.success)fs.writeFileSync(path.join(path.dirname(result.executable),path.basename(file)),source,'utf8');
    }else throw Error('Operação desconhecida.');
    process.stdout.write(JSON.stringify({revision:request.revision,hash,result}));
  }catch(error){process.stdout.write(JSON.stringify({error:error.message}));process.exitCode=1;}
});
