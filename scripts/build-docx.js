'use strict';
const fs = require('node:fs');
const path = require('node:path');
const {root, platform, toolchain, command} = require('../tom-lang/core/native-build');

function buildDocx() {
  const config = require('./toolchain.json');
  const windows = process.platform === 'win32';
  const native = path.join(platform, 'native');
  const cmake = path.join(platform, 'cmake/bin', windows ? 'cmake.exe' : 'cmake');
  const ninja = path.join(platform, 'ninja', windows ? 'ninja.exe' : 'ninja');
  for (const name of ['miniz', 'libxml2']) {
    const spec = config[name];
    const source = path.join(root, '.tools/sources', `${name}-${spec.version}`);
    const build = path.join(native, 'build', name);
    const options = name === 'miniz' ? ['-DBUILD_EXAMPLES=OFF', '-DBUILD_TESTS=OFF'] : [
      '-DLIBXML2_WITH_PROGRAMS=OFF', '-DLIBXML2_WITH_TESTS=OFF', '-DLIBXML2_WITH_PYTHON=OFF',
      '-DLIBXML2_WITH_ICONV=OFF', '-DLIBXML2_WITH_ICU=OFF', '-DLIBXML2_WITH_ZLIB=OFF',
      '-DLIBXML2_WITH_LZMA=OFF', '-DLIBXML2_WITH_HTTP=OFF', '-DLIBXML2_WITH_FTP=OFF',
    ];
    command(cmake, ['-S', source, '-B', build, '-G', 'Ninja', '-DCMAKE_BUILD_TYPE=Release',
      '-DBUILD_SHARED_LIBS=OFF', '-DCMAKE_C_COMPILER=' + toolchain().clang,
      '-DCMAKE_MAKE_PROGRAM=' + ninja, '-DCMAKE_INSTALL_PREFIX=' + native, ...options]);
    command(cmake, ['--build', build, '-j', '4']);
    command(cmake, ['--install', build]);
    fs.copyFileSync(path.join(source, name === 'miniz' ? 'LICENSE' : 'Copyright'), path.join(native, name + '.LICENSE'));
    fs.writeFileSync(path.join(build, 'receipt.json'), JSON.stringify(spec, null, 2) + '\n');
  }
}

async function setupDocx() {
  const {download} = require('./setup-native');
  for (const name of ['miniz', 'libxml2']) {
    const spec = require('./toolchain.json')[name];
    const archive = await download(spec);
    const sources = path.join(root, '.tools/sources');
    fs.mkdirSync(sources, {recursive: true});
    if (!fs.existsSync(path.join(sources, `${name}-${spec.version}`))) command(process.platform === 'win32' ? 'tar.exe' : 'tar', ['-xf', archive, '-C', sources]);
  }
  buildDocx();
}
module.exports = {buildDocx, setupDocx};
if (require.main === module) setupDocx().catch(error => { console.error(error); process.exitCode = 1; });
