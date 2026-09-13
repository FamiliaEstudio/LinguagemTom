'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { root, platform, toolchain, command } = require('../tom-lang/core/native-build');
function buildYyjson() {
  const source = path.join(root, '.tools/sources/yyjson-0.12.0');
  const clang = toolchain().clang, msvc = command(clang, ['-dumpmachine']).stdout.includes('windows-msvc');
  const native = path.join(platform, msvc ? 'native-msvc' : 'native');
  const build = path.join(native, 'build/yyjson');
  for (const directory of [build, path.join(native, 'include'), path.join(native, 'lib')]) fs.mkdirSync(directory, { recursive: true });
  const object = path.join(build, 'yyjson.o');
  command(clang, ['-O2', '-std=c17', '-D_CRT_SECURE_NO_WARNINGS', '-c', path.join(source, 'src/yyjson.c'), '-o', object]);
  const ar = path.join(path.dirname(clang), process.platform === 'win32' ? 'llvm-ar.exe' : 'llvm-ar');
  command(fs.existsSync(ar) ? ar : 'ar', ['rcs', path.join(native, 'lib', msvc ? 'yyjson.lib' : 'libyyjson.a'), object]);
  fs.copyFileSync(path.join(source, 'src/yyjson.h'), path.join(native, 'include/yyjson.h'));
  fs.copyFileSync(path.join(source, 'LICENSE'), path.join(native, 'yyjson.LICENSE'));
  fs.writeFileSync(path.join(build, 'receipt.json'), JSON.stringify({ ...require('./toolchain.json').yyjson, compiler: clang, target: command(clang, ['-dumpmachine']).stdout.trim(), flags: '-O2 -std=c17' }, null, 2));
  process.stdout.write('yyjson 0.12.0: ' + native + '\n');
}
if (require.main === module) buildYyjson();
module.exports = { buildYyjson };
