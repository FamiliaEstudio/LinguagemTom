'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { root, platform, toolchain, command } = require('../tom-lang/core/native-build');
function buildMpdecimal() {
  const source = path.join(root, '.tools/sources/mpdecimal-4.0.1/libmpdec');
  if (!fs.existsSync(source)) throw new Error('Extraia mpdecimal-4.0.1 em .tools/sources primeiro.');
  const clang = toolchain().clang;
  const msvc = command(clang, ['-dumpmachine']).stdout.includes('windows-msvc');
  const native = path.join(platform, msvc ? 'native-msvc' : 'native');
  const build = path.join(native, 'build/mpdecimal');
  fs.mkdirSync(build, { recursive: true }); fs.mkdirSync(path.join(native, 'include'), { recursive: true }); fs.mkdirSync(path.join(native, 'lib'), { recursive: true });
  for (const name of fs.readdirSync(source)) if (/\.(?:c|h)$/.test(name)) fs.copyFileSync(path.join(source, name), path.join(build, name));
  const header = fs.readFileSync(path.join(source, 'mpdecimal.h.in'), 'utf8').replace('@MPD_HEADER_CONFIG@', '#define MPD_CONFIG_64 1');
  fs.writeFileSync(path.join(build, 'mpdecimal.h'), header);
  const files = 'basearith context constants convolute crt mpdecimal mpsignal difradix2 fnt fourstep io mpalloc numbertheory sixstep transpose'.split(' ');
  const objects = files.map(name => path.join(build, name + '.o'));
  files.forEach((name, i) => {
    command(clang, ['-O2', '-std=c99', '-DCONFIG_64', '-DANSI', '-DNDEBUG', '-D_CRT_SECURE_NO_WARNINGS', '-c', path.join(build, name + '.c'), '-o', objects[i]]);
  });
  const ar = path.join(path.dirname(clang), process.platform === 'win32' ? 'llvm-ar.exe' : 'llvm-ar');
  const library = path.join(native, 'lib', msvc ? 'mpdec.lib' : 'libmpdec.a');
  command(fs.existsSync(ar) ? ar : 'ar', ['rcs', library, ...objects]);
  fs.writeFileSync(path.join(native, 'include/mpdecimal.h'), header);
  fs.copyFileSync(path.join(source, '../doc/COPYRIGHT.txt'), path.join(native, 'mpdecimal.LICENSE'));
  process.stdout.write('libmpdec 4.0.1: ' + library + '\n');
}
if (require.main === module) buildMpdecimal();
module.exports = { buildMpdecimal };
