'use strict';
// Opens a real desktop window and targets only the process created by this script.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { compile } = require('../tom-lang/core/compiler');
const { buildApplication, platform, root } = require('../tom-lang/core/native-build');
async function main() {
  const production = process.argv.includes('--package');
  const directory = path.join(platform, 'validation'); fs.mkdirSync(directory, { recursive: true });
  const source = path.join(root, 'tom-lang/exemplos/calculadora.tom');
  const result = compile(fs.readFileSync(source, 'utf8'), { file: source });
  assert.equal(result.success, true, JSON.stringify(result.diagnostics));
  const executable = buildApplication(result, source, production ? undefined : path.join(directory, 'desktop'), { testUI: !production });
  const trace = path.join(directory, 'desktop.trace'), snapshot = path.join(directory, 'calculadora.bmp');
  const env = { ...process.env, TOM_UI_TRACE: trace, TOM_UI_SNAPSHOT: snapshot, SDL_RENDER_DRIVER: 'software' };
  delete env.TOM_UI_EVENTS; delete env.SDL_VIDEODRIVER;
  delete env.LD_LIBRARY_PATH;
  // The packaged application must run without developer tools or their DLL paths.
  env.PATH = process.platform === 'win32' ? `${process.env.SystemRoot}/System32;${process.env.SystemRoot}` : '/usr/bin:/bin';
  const app = spawn(executable, [], { env, stdio: 'inherit' });
  const exited = new Promise((resolve, reject) => { app.on('error', reject); app.on('exit', resolve); });
  try {
    const windows = process.platform === 'win32';
    const driver = spawn(windows ? 'powershell.exe' : 'python3', windows
      ? ['-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(__dirname, 'desktop-windows.ps1'), '-ProcessId', String(app.pid)]
      : [path.join(__dirname, 'desktop-linux.py'), String(app.pid)], { stdio: 'inherit' });
    const status = await new Promise((resolve, reject) => { driver.on('error', reject); driver.on('exit', resolve); });
    assert.equal(status, 0, 'Desktop input driver failed');
    const timeout = setTimeout(() => app.kill(), 10000);
    const appStatus = await exited; clearTimeout(timeout); assert.equal(appStatus, 0);
    if (!production) {
      const displays = [...fs.readFileSync(trace, 'utf8').matchAll(/^TEXT 36 86 (.*)$/gm)].map(x => x[1]);
      for (const expected of ['0,3', '20', '80', '5', 'Erro', '15']) assert.ok(displays.includes(expected), JSON.stringify(displays));
      assert.ok(fs.statSync(snapshot).size > 100000);
    }
    process.stdout.write(production ? `Package opened and closed without developer tools: ${executable}\n` : `Desktop validated (${process.platform}): keyboard, mouse, resize, errors and close.\n${snapshot}\n`);
  } finally { if (app.exitCode === null) app.kill(); }
}
main().catch(error => { process.stderr.write(error.stack + '\n'); process.exitCode = 1; });
