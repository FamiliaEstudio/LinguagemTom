'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { compile } = require('../core/compiler');
const { linkArguments, copyAssets, copyProjectAssets } = require('../core/native-build');

function success(source, options) {
  const result = compile(source, options);
  assert.equal(result.success, true, JSON.stringify(result.diagnostics));
  return result.artifacts.llvm;
}

function rejection(source, code) {
  const result = compile(source, { file: 'case.tom' });
  assert.equal(result.success, false);
  assert.deepEqual(result.artifacts, {});
  assert.equal(result.diagnostics[0].code, code);
  assert.equal(result.diagnostics[0].severity, 'error');
  return result.diagnostics[0];
}

function command(bin, args, options = {}) {
  const result = spawnSync(bin, args, { encoding: 'utf8', timeout: 20000, ...options });
  assert.ifError(result.error);
  assert.equal(result.status, 0, `${bin} ${args.join(' ')}\n${result.stderr}\n${result.stdout}`);
  return result;
}

function execute(source, { input = '', optimize = '-O0', file = 'case.tom', modules = {}, assets, environment = {}, events, snapshot, maximumLiveObjects = 0, nativeSources = [], linkFlags = [], isolatedCwd = false } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tom-test-'));
  try {
    const ir = path.join(dir, 'case.ll');
    const binary = path.join(dir, process.platform === 'win32' ? 'case.exe' : 'case');
    const compilation = compile(source, { file, modules });
    assert.equal(compilation.success, true, JSON.stringify(compilation.diagnostics));
    const hasRuntime = compilation.artifacts.runtimeRequirements.length > 0;
    fs.writeFileSync(ir, hasRuntime ? compilation.artifacts.llvm.replace('define i32 @main()', 'define i32 @tom_program_main()') : compilation.artifacts.llvm);
    command(process.env.LLVM_OPT || 'opt', ['-passes=verify', '-disable-output', ir]);
    const libs = linkArguments(compilation.artifacts.runtimeRequirements, process.env.CLANG || 'clang', { testUI: events !== undefined });
    if (hasRuntime) {
      const harness = path.join(dir, 'leaks.c');
      fs.writeFileSync(harness, `#include <stdint.h>\n#include <stdio.h>\nextern int tom_program_main(void);\nextern int64_t tom_live_objects(void);\nextern int64_t tom_peak_objects(void);\nint main(void) { int status = tom_program_main(); if (tom_live_objects()) { puts("TOM_RESOURCE_LEAK"); return 91; } if (${maximumLiveObjects} && tom_peak_objects() > ${maximumLiveObjects}) { puts("TOM_RESOURCE_ACCUMULATION"); return 92; } return status; }\n`);
      libs.push(harness);
    }
    command(process.env.CLANG || 'clang', [optimize, ir, '-o', binary, ...libs, ...nativeSources, ...linkFlags]);
    copyAssets(dir, compilation.artifacts.runtimeRequirements, compilation.artifacts.assetRequirements);
    if (assets) copyProjectAssets(assets,path.join(dir,'assets'));
    const env = { ...process.env, ...environment };
    if (events !== undefined) {
      if (!env.TOM_DATA_DIRECTORY) env.TOM_DATA_DIRECTORY = path.join(dir, 'user-data');
      env.TOM_UI_EVENTS = path.join(dir, 'events.txt'); env.TOM_UI_TRACE = path.join(dir, 'trace.txt');
      fs.writeFileSync(env.TOM_UI_EVENTS, events);
      if (snapshot) env.TOM_UI_SNAPSHOT = snapshot;
    }
    const result = spawnSync(binary, [], { encoding: 'utf8', timeout: 15000, input, env, ...(isolatedCwd ? {cwd:dir} : {}) });
    assert.ifError(result.error);
    assert.equal(result.signal, null);
    return { ...result, stdout: result.stdout.replace(/\r\n/g, '\n'), trace: events !== undefined && fs.existsSync(env.TOM_UI_TRACE) ? fs.readFileSync(env.TOM_UI_TRACE, 'utf8') : '' };
  } finally {
    // Windows may briefly retain an executable handle after process exit.
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
}

function checkValue(type, operand, expected) {
  return `EscopoInixTooHigh\nSeMaiorxy${type}x${operand}y${expected}\nGerarTxtxl'BAD'\nEscopoFimxTooHigh\nEscopoInixTooLow\nSeMaiorxy${type}x${expected}y${operand}\nGerarTxtxl'BAD'\nEscopoFimxTooLow\nGerarTxtxl'OK'`;
}

module.exports = { success, rejection, command, execute, checkValue };
