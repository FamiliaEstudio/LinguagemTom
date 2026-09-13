'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const cli = path.resolve(__dirname, '../tomc.js');

test('CLI publishes only valid compilations and separates output names', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tom-cli-'));
  const run = args => {
    const result = spawnSync(process.execPath, [cli, ...args], { cwd: dir, encoding: 'utf8', timeout: 5000 });
    assert.ifError(result.error);
    assert.equal(result.signal, null);
    return result;
  };
  try {
    fs.writeFileSync(path.join(dir, 'a.tom'), 'SomarxyInSd32x1y2');
    fs.writeFileSync(path.join(dir, 'b.tom'), "GerarTxtxl'b'");
    let r = run(['a.tom']);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /Compilação concluída/);
    assert.equal(run(['b.tom']).status, 0);
    assert.deepEqual(fs.readdirSync(path.join(dir, 'build')).sort(), ['a.ll', 'b.ll']);
    const previous = fs.readFileSync(path.join(dir, 'build/a.ll'), 'utf8');
    fs.writeFileSync(path.join(dir, 'a.tom'), 'NaoExiste');
    r = run(['a.tom']);
    assert.equal(r.status, 1);
    assert.equal(r.stdout, '');
    assert.match(r.stderr, /a\.tom:1:1: error E_SYNTAX/);
    assert.equal(fs.readFileSync(path.join(dir, 'build/a.ll'), 'utf8'), previous);
    r = run(['--out-dir', 'missing', 'a.tom']);
    assert.equal(r.status, 1);
    assert.equal(fs.existsSync(path.join(dir, 'missing')), false);
    assert.equal(run(['--check', 'b.tom']).status, 0);
    assert.equal(run(['--emit-mlir', 'b.tom']).status, 1);
    assert.equal(run(['--unknown', 'b.tom']).status, 1);
    assert.equal(run(['-o', 'b.tom', 'b.tom']).status, 1);
    assert.equal(run(['--check', 'missing.tom']).status, 1);
    fs.writeFileSync(path.join(dir, 'invalid.tom'), Buffer.from([0x47, 0x65, 0xFF]));
    assert.match(run(['invalid.tom']).stderr, /E_ENCODING/);
    assert.equal(fs.existsSync(path.join(dir, 'build/invalid.ll')), false);
    assert.equal(run([]).status, 1);
    assert.equal(run(['--help']).status, 0);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('build/run verifies, links and publishes atomically; failures preserve the last application', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tom-build-'));
  const run = (args, env = {}) => {
    const r = spawnSync(process.execPath, [cli, '--out-dir', 'build', ...args], { cwd: dir, env: { ...process.env, ...env }, encoding: 'utf8', timeout: 30000 });
    assert.ifError(r.error); return r;
  };
  try {
    fs.writeFileSync(path.join(dir, 'a.tom'), "DefVarDc34xAy0.3\nDefStkFB64CxByl''\nDc34ParaTexto[@A,@B]\nGerarTxtxB");
    const built = path.join(dir, 'build/a'), exe = path.join(built, process.platform === 'win32' ? 'a.exe' : 'a');
    let r = run(['--run', 'a.tom']);
    assert.equal(r.status, 0, r.stderr); assert.match(r.stdout, /0\.3$/);
    assert.ok(fs.readdirSync(built).some(x => /mpdec.*(?:LICENSE|COPYRIGHT)/i.test(x)));
    const previous = fs.readFileSync(exe);
    r = run(['--build', 'a.tom'], { CLANG: path.join(dir, 'missing-clang') });
    assert.equal(r.status, 1); assert.equal(r.stdout, ''); assert.deepEqual(fs.readFileSync(exe), previous);
    assert.deepEqual(fs.readdirSync(path.join(dir, 'build')), ['a']);
    fs.writeFileSync(path.join(dir, 'a.tom'), 'NotTom');
    assert.equal(run(['--build', 'a.tom']).status, 1); assert.deepEqual(fs.readFileSync(exe), previous);
    assert.equal(run(['--build', '--check', 'a.tom']).status, 1);
    fs.writeFileSync(path.join(dir, 'b.tom'), "GerarTxtxl'b'");
    fs.mkdirSync(path.join(dir, 'build/b')); fs.writeFileSync(path.join(dir, 'build/b/user.txt'), 'keep');
    assert.equal(run(['--build', 'b.tom']).status, 1); assert.equal(fs.readFileSync(path.join(dir, 'build/b/user.txt'), 'utf8'), 'keep');
  } finally { fs.rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); }
});

test('CLI resolves modules, bundles checked assets and preserves packages on asset errors', () => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'tom-modules-'));
  const run=args=>spawnSync(process.execPath,[cli,'--out-dir','build',...args],{cwd:dir,encoding:'utf8',timeout:30000});
  try {
    fs.writeFileSync(path.join(dir,'app.tom'),"Importar[l'./lib.tom']\nChamarxF[]\nGerarTxtxl'OK'");
    fs.writeFileSync(path.join(dir,'lib.tom'),"Importar[l'tom/musica']\nDefFuncaoxF[]yVazio\nChamarxMusicaAltura[0,4,0]\nFimFuncao");
    fs.mkdirSync(path.join(dir,'assets'));fs.writeFileSync(path.join(dir,'assets','custom.txt'),'UTF-8: ♯ %');
    let result=run(['--run','--assets','assets','app.tom']);assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/OK$/);
    const packageDir=path.join(dir,'build/app');
    assert.equal(fs.readFileSync(path.join(packageDir,'assets/custom.txt'),'utf8'),'UTF-8: ♯ %');
    assert.ok(fs.statSync(path.join(packageDir,'assets/tom/Bravura.otf')).size>800000);
    assert.ok(fs.existsSync(path.join(packageDir,'assets/tom/Bravura.LICENSE')));
    const manifest=fs.readFileSync(path.join(packageDir,'tom-build.json'),'utf8');
    assert.ok(JSON.parse(manifest).assets.includes('tom/Bravura.otf'));
    fs.mkdirSync(path.join(dir,'assets/tom'));fs.writeFileSync(path.join(dir,'assets/tom/Bravura.otf'),'collision');
    result=run(['--build','--assets','assets','app.tom']);assert.equal(result.status,1);assert.match(result.stderr,/colide/);
    assert.equal(fs.readFileSync(path.join(packageDir,'tom-build.json'),'utf8'),manifest);
    assert.deepEqual(fs.readdirSync(path.join(dir,'build')),['app']);
    assert.equal(run(['--assets','assets','app.tom']).status,1);
    fs.writeFileSync(path.join(dir,'lib.tom'),'\nDefConstInSd32xCyinvalid');
    result=run(['--check','app.tom']);assert.equal(result.status,1);assert.match(result.stderr,/lib\.tom:2:1: error E_LITERAL/);
    fs.writeFileSync(path.join(dir,'lib.tom'),Buffer.from([255]));
    assert.match(run(['--check','app.tom']).stderr,/E_ENCODING/);
  } finally {fs.rmSync(dir,{recursive:true,force:true,maxRetries:10,retryDelay:100});}
});
