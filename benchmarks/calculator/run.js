'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { build } = require('./build');
const { workload } = require('./workload');

function options(argv) {
  const result = { samples: 9, cycles: null, warmup: 1, mode: 'all', opt: null, seed: 20260912, targetMs: 250, idleMs: 1000 };
  const numbers = { '--samples':['samples',1,100], '--cycles':['cycles',1,100000], '--warmup':['warmup',0,100], '--seed':['seed',1,0xffffffff], '--target-ms':['targetMs',50,10000], '--idle-ms':['idleMs',50,60000] };
  for (let i=0;i<argv.length;i++) {
    const flag=argv[i];
    if (numbers[flag]) {
      const [key,min,max]=numbers[flag],value=argv[++i];
      if (!/^\d+$/.test(value || '') || Number(value)<min || Number(value)>max) throw new Error(`Invalid ${flag}`);
      result[key]=Number(value);
    } else if (['--verify','--build','--run-c','--help'].includes(flag)) result[flag.slice(2)]=true;
    else if(flag==='--quick') Object.assign(result,{samples:3,targetMs:100,idleMs:200});
    else if(flag==='--mode') { result.mode=argv[++i]; if(!['all','headless','render','idle'].includes(result.mode)) throw new Error('Invalid mode'); }
    else if(flag==='--opt') { result.opt='-'+argv[++i]; if(!['-O0','-O2'].includes(result.opt)) throw new Error('Use --opt O0 or O2'); }
    else if(flag==='--out') { result.out=argv[++i]; if(!result.out) throw new Error('Missing --out'); }
    else throw new Error('Unknown option: '+flag);
  }
  return result;
}
function execute(executable,args) {
  const env={...process.env,SDL_VIDEODRIVER:'dummy',SDL_RENDER_DRIVER:'software'};
  for(const key of ['TOM_UI_EVENTS','TOM_UI_TRACE','TOM_UI_SNAPSHOT']) delete env[key];
  const begin=process.hrtime.bigint();
  const result=spawnSync(executable,args.map(String),{env,encoding:'utf8',timeout:120000,maxBuffer:16*1024*1024});
  if(result.error) throw result.error;
  if(result.status!==0) throw new Error(`Benchmark failed: ${executable}\n${result.stderr}\n${result.stdout}`);
  const parsed=JSON.parse(result.stdout);
  assert.equal(parsed.schema,1);assert.equal(parsed.live_objects_at_exit,0);
  for(const key of ['elapsed_ms','cpu_ms','first_frame_ms','peak_resident_bytes','events','frames','tracked_acquisitions']) {
    assert.ok(Number.isFinite(parsed[key]) && parsed[key]>=0,`Invalid native metric ${key}`);
  }
  assert.ok(parsed.elapsed_ms>0);
  return {...parsed,process_wall_ms:Number(process.hrtime.bigint()-begin)/1e6};
}
function equalObservations(actual,expected,label) {
  const index=actual.findIndex((f,i)=>JSON.stringify(f)!==JSON.stringify(expected[i]));
  if(index!==-1 || actual.length!==expected.length) {
    const at=index===-1?Math.min(actual.length,expected.length):index;
    throw new Error(`${label}: observation ${at}; actual=${JSON.stringify(actual[at])}; expected=${JSON.stringify(expected[at])}; lengths ${actual.length}/${expected.length}`);
  }
}
function verify(built,fixture,oracle) {
  const results={};
  for(const mode of ['headless','render']) {
    const runs={};
    for(const language of ['c','tom']) {
      const r=execute(built[mode][language],[fixture,1,0,1]);
      assert.equal(r.checksum,expectedChecksum(oracle.observations,1));
      equalObservations(r.observations.map(({display,message})=>({display,message})),oracle.observations,`${mode}/${language}`);
      assert.equal(r.events,oracle.events);
      assert.equal(r.frames,oracle.observations.length-1);
      runs[language]=r;
    }
    equalObservations(runs.tom.observations,runs.c.observations,`${mode} full drawing command stream`);
    assert.equal(runs.tom.checksum,runs.c.checksum);
    results[mode]={checksum:runs.tom.checksum,events:runs.tom.events,frames:runs.tom.frames,observations:runs.tom.observations};
  }
  assert.equal(results.headless.checksum,results.render.checksum);
  return results;
}
function stats(values) {
  if(!values.length || values.some(v=>!Number.isFinite(v))) throw new Error('Statistics require finite samples');
  const s=[...values].sort((a,b)=>a-b),n=s.length;
  const median=n%2?s[(n-1)/2]:(s[n/2-1]+s[n/2])/2;
  return {count:n,min:s[0],median,p95:s[Math.ceil(n*.95)-1],max:s[n-1],mean:s.reduce((a,b)=>a+b,0)/n};
}
function expectedChecksum(observations,cycles) {
  const bytes=Buffer.concat(observations.slice(1).flatMap(f=>[Buffer.from(f.display+'\0','utf8'),Buffer.from(f.message+'\0','utf8')]));
  let hash=14695981039346656037n;
  for(let i=0;i<cycles;i++) for(const b of bytes) hash=BigInt.asUintN(64,(hash^BigInt(b))*1099511628211n);
  return hash.toString(16).padStart(16,'0');
}
function markdown(report) {
  const rows=[];
  for(const mode of report.modes) for(const language of ['c','tom']) {
    const records=report.samples.filter(r=>r.mode===mode && r.language===language);
    const elapsed=stats(records.map(r=>mode==='idle'?r.elapsed_ms:r.elapsed_ms/r.cycles));
    const cpu=stats(records.map(r=>r.cpu_ms/r.elapsed_ms*100));
    const rss=stats(records.map(r=>r.peak_resident_bytes/1048576));
    const alloc=stats(records.map(r=>mode==='idle'?r.tracked_acquisitions:r.tracked_acquisitions/r.cycles));
    rows.push(`| ${mode} | ${language} | ${elapsed.median.toFixed(3)} | ${elapsed.p95.toFixed(3)} | ${cpu.median.toFixed(2)} | ${rss.median.toFixed(2)} | ${alloc.median.toFixed(0)} |`);
  }
  return `# Benchmark da calculadora: Tom e C\n\nGerado em ${report.createdAt}. ${report.environment.platform} ${report.environment.release}, ${report.environment.cpu}. Build ${report.build.optimize}; SDL dummy/software; VSync desativado.\n\n`+
    `Oráculo aprovado: ${report.workload.cases.length} cenários, ${report.workload.events} eventos/ciclo, ${report.verification.render.frames} quadros/ciclo. Cada amostra é um novo processo; ordem intercalada com semente ${report.options.seed}.\n\n`+
    '| Modo | Versão | Mediana ms/ciclo¹ | p95 ms/ciclo¹ | CPU %² | Pico residente MiB³ | Objetos adquiridos/ciclo¹ |\n|---|---|---:|---:|---:|---:|---:|\n'+rows.join('\n')+
    '\n\n¹ Em idle: tempo total da espera e aquisições durante a espera. Um ciclo executa o roteiro inteiro, não apenas uma soma.\n\n'+
    '² Tempo de CPU do processo / tempo decorrido. Em amostras curtas no Windows, a granularidade do contador pode produzir zero.\n\n'+
    '³ Pico de todo o processo, incluindo inicialização e aquecimento; Linux usa ru_maxrss e Windows PeakWorkingSetSize. Compare versões dentro do mesmo sistema.\n\n'+
    'Headless conserva entrada, estado, conversões, formatação e observação do visor, com Desenhar substituído nas duas versões. Render conserva o fonte Tom original e rasteriza em software fora da tela. Idle usa SDL_WaitEvent real, acordada por um timer.\n\n'+
    'As medições incluem o adaptador e checksum compartilhados; não medem latência física do teclado/monitor. Objetos adquiridos são objetos rastreados pelo runtime Tom, não todas as alocações malloc/SDL/libmpdec.\n\n'+
    'A versão C é escrita manualmente e usa tabela de botões, switch e atualização direta de destinos. A comparação caracteriza estas implementações e suas escolhas de alocação; não estabelece uma classificação geral de linguagens.\n\n'+
    'report.json contém todas as amostras, calibração, primeiro quadro a partir da entrada instrumentada, tempo do processo visto pelo Node, hashes, ferramentas e objetos compartilhados. Não há limite de desempenho usado como teste de CI.\n';
}
function writeReports(out,report) {
  fs.mkdirSync(out,{recursive:true});
  const keys=['mode','language','sample','cycles','elapsed_ms','cpu_ms','frames','events','tracked_acquisitions','peak_tracked_objects','peak_resident_bytes','first_frame_ms','process_wall_ms','checksum'];
  const csv=keys.join(',')+'\n'+report.samples.map(r=>keys.map(k=>r[k]).join(',')).join('\n')+'\n';
  for(const [name,value] of [['report.json',JSON.stringify(report,null,2)+'\n'],['samples.csv',csv],['report.md',markdown(report)]]) {
    const temp=path.join(out,name+'.tmp');fs.writeFileSync(temp,value);fs.renameSync(temp,path.join(out,name));
  }
}
function main(argv=process.argv.slice(2)) {
  const opts=options(argv);
  if(opts.help) {
    console.log('node benchmarks/calculator/run.js [--verify | --build | --run-c | --quick]\n  --mode all|headless|render|idle --opt O0|O2 --samples N --cycles N\n  --target-ms N --warmup N --idle-ms N --seed N --out DIR');return;
  }
  const optimizations=opts.verify && !opts.opt?['-O0','-O2']:[opts.opt || '-O2'];
  for(const optimize of optimizations) {
    console.log(`Building C/Tom ${optimize} with shared runtime objects...`);
    const built=build(optimize);
    if(opts.build) { console.log(built.desktop);continue; }
    if(opts['run-c']) {
      console.log(built.desktop);
      const run=spawnSync(built.desktop,[],{stdio:'inherit'});if(run.error) throw run.error;
      if(run.status!==0) throw new Error(`Calculator exited with ${run.status}`);return;
    }
    const oracle=workload(),fixture=path.join(built.base,'events.txt');fs.writeFileSync(fixture,oracle.text);
    const verification=verify(built,fixture,oracle);
    console.log(`Verified ${oracle.cases.length} scenarios, ${oracle.events} events, ${verification.render.frames} frames; C/Tom outputs and drawing commands match.`);
    fs.writeFileSync(path.join(built.base,'verification.json'),JSON.stringify({sourceSHA256:built.manifest.sourceSHA256,cases:oracle.cases,verification},null,2)+'\n');
    if(opts.verify) {
      for(const language of ['c','tom']) execute(built.render[language],['--idle',100]);
      continue;
    }
    const modes=opts.mode==='all'?['headless','render','idle']:[opts.mode];
    const samples=[],calibration={};let random=opts.seed>>>0;
    for(const mode of modes) {
      let cycles=0;
      if(mode!=='idle') {
        calibration[mode]={};
        for(const language of ['c','tom']) calibration[mode][language]=execute(built[mode][language],[fixture,1,opts.warmup,0]);
        assert.equal(calibration[mode].c.checksum,verification[mode].checksum);
        assert.equal(calibration[mode].tom.checksum,verification[mode].checksum);
        cycles=opts.cycles || Math.min(10000,Math.max(1,Math.ceil(opts.targetMs/Math.min(calibration[mode].c.elapsed_ms,calibration[mode].tom.elapsed_ms))));
      }
      console.log(`Measuring ${mode}: ${opts.samples} samples per version${mode==='idle'?`, ${opts.idleMs} ms wait`:`, ${cycles} cycles/sample, ${opts.warmup} warmup cycles`}.`);
      const expected=mode==='idle'?null:expectedChecksum(oracle.observations,cycles);
      for(let sample=0;sample<opts.samples;sample++) {
        random^=random<<13;random^=random>>>17;random^=random<<5;
        const pair=[];
        for(const language of (random&1?['c','tom']:['tom','c'])) {
          const r=execute(built[mode==='idle'?'render':mode][language],mode==='idle'?['--idle',opts.idleMs]:[fixture,cycles,opts.warmup,0]);
          if(mode!=='idle') {
            assert.equal(r.events,oracle.events*cycles);assert.equal(r.frames,verification[mode].frames*cycles);
            assert.equal(r.checksum,expected,'Measured output differs from the independent oracle');
          }
          pair.push(r);samples.push({mode,language,sample,cycles,...r});
        }
        assert.equal(pair[0].checksum,pair[1].checksum,'Measured results diverged');
      }
    }
    const report={schema:1,createdAt:new Date().toISOString(),environment:{platform:process.platform,arch:process.arch,release:os.release(),cpu:os.cpus()[0]?.model,totalMemoryBytes:os.totalmem(),videoDriver:'dummy',renderDriver:'software'},options:opts,modes,
      build:built.manifest,workload:{sha256:require('./build').hashFile(fixture),events:oracle.events,cases:oracle.cases},verification,calibration,samples};
    const out=opts.out?path.resolve(opts.out):path.join(built.base,'results',report.createdAt.replace(/[:.]/g,'-'));
    writeReports(out,report);console.log(`Reports: ${path.join(out,'report.md')}`);
  }
}
if(require.main===module) { try { main(); } catch(error) { console.error(error.stack);process.exitCode=1; } }
module.exports={options,stats,expectedChecksum,verify,execute,main};
