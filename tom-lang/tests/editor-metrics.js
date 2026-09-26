'use strict';
const fs=require('node:fs'),path=require('node:path');
const {platform}=require('../core/native-build');
module.exports=function record(kind,optimization,stdout){
 const directory=path.join(platform,'validation-editor/measurements');fs.mkdirSync(directory,{recursive:true});
 const metrics=Object.fromEntries([...stdout.matchAll(/([a-z-]+)=(\d+(?:\.\d+)?)/g)].map(m=>[m[1],Number(m[2])]));
 fs.writeFileSync(path.join(directory,`${kind}-${optimization.slice(1)}.json`),JSON.stringify({platform:process.platform,optimization,date:new Date().toISOString(),characters:1024000,metrics},null,2)+'\n');
};
