'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { root, platform, toolchain, command } = require('../tom-lang/core/native-build');
const { buildMpdecimal } = require('./build-mpdecimal');
const { buildYyjson } = require('./build-yyjson');
const config = require('./toolchain.json');
const windows = process.platform === 'win32';
const downloads = path.join(root, '.tools/downloads');
const sources = path.join(root, '.tools/sources');
const native = path.join(platform, 'native');
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
async function download(spec) {
  fs.mkdirSync(downloads, { recursive: true }); const file = path.join(downloads, spec.file);
  if (!fs.existsSync(file)) {
    process.stdout.write(`Downloading ${spec.file}\n`);
    command(windows ? 'curl.exe' : 'curl', ['-fL', '--retry', '3', '--connect-timeout', '30', spec.url, '-o', file + '.partial'], { timeout: 600000 });
    if (hash(file + '.partial') !== spec.sha256) throw new Error('Checksum mismatch: ' + file);
    fs.renameSync(file + '.partial', file);
  }
  if (hash(file) !== spec.sha256) throw new Error('Checksum mismatch: ' + file);
  return file;
}
function extract(archive, directory, strip = 0) {
  fs.mkdirSync(directory, { recursive: true });
  if (!windows && archive.endsWith('.zip')) { command('python3', ['-m', 'zipfile', '-e', archive, directory]); return; }
  command(windows ? 'tar.exe' : 'tar', ['-xf', archive, '-C', directory, ...(strip ? ['--strip-components=' + strip] : [])]);
}
async function setupWindows() {
  for (const [key, name, strip] of [['cmakeWindows', 'cmake', 1], ['ninjaWindows', 'ninja', 0]]) {
    const dest = path.join(platform, name), archive = await download(config[key]);
    if (!fs.existsSync(path.join(dest, '.complete'))) { extract(archive, dest, strip); fs.writeFileSync(path.join(dest, '.complete'), config[key].sha256); }
  }
  for (const [key, name] of [['sdlWindows', 'SDL3-3.4.16'], ['ttfWindows', 'SDL3_ttf-3.2.2']]) {
    const unpack = path.join(platform, 'sdl-packages'); extract(await download(config[key]), unpack);
    fs.cpSync(path.join(unpack, name, 'x86_64-w64-mingw32'), native, { recursive: true });
    for (const file of fs.readdirSync(path.join(unpack, name))) if (/license|copying/i.test(file)) fs.copyFileSync(path.join(unpack, name, file), path.join(native, name + '-' + file));
  }
  buildMpdecimal();
}
const linuxPackages = 'pkgconf pkgconf-bin libpkgconf3 libx11-dev libxext-dev libxcursor-dev libxrandr-dev libxi-dev libxfixes-dev libxrender-dev x11proto-dev xorg-sgml-doctools xtrans-dev libxcb1-dev libxau-dev libxdmcp-dev libx11-6 libxext6 libxcursor1 libxrandr2 libxi6 libxfixes3 libxrender1 libxcb1 libxau6 libxdmcp6 libfreetype-dev libfreetype6 libpng-dev libpng16-16t64 zlib1g-dev zlib1g libbrotli-dev libbrotli1 libbz2-dev libbz2-1.0'.split(' ');
async function setupLinux() {
  const codecs = [...command('apt-cache', ['depends','libsndfile1']).stdout.matchAll(/^\s+Depends: (\S+)/gm)].map(m => m[1]).filter(p => p !== 'libc6');
  const audioPackages = ['libasound2-dev','libasound2t64','libasound2-data','libpulse-dev','libpulse0','libasyncns0','libsndfile1',...codecs];
  linuxPackages.push('patchelf',...audioPackages);
  for (const [key, name, strip] of [['cmakeLinux', 'cmake', 1], ['ninjaLinux', 'ninja', 0]]) {
    const dest = path.join(platform, name), archive = await download(config[key]);
    if (!fs.existsSync(path.join(dest, '.complete'))) { extract(archive, dest, strip); fs.writeFileSync(path.join(dest, '.complete'), config[key].sha256); }
  }
  fs.chmodSync(path.join(platform, 'ninja/ninja'), 0o755);
  const tools = path.join(platform, 'build-tools'), sysroot = path.join(tools, 'root');
  fs.mkdirSync(tools, { recursive: true });
  // APT packages must match the host distribution/ABI. Record exact versions and hashes.
  if (!fs.existsSync(path.join(sysroot, '.tom-0.3-audio'))) {
    if (command('apt-cache', ['policy', 'libpkgconf7']).stdout.includes('Candidate:') && !command('apt-cache', ['policy', 'libpkgconf7']).stdout.includes('Candidate: (none)')) linuxPackages[linuxPackages.indexOf('libpkgconf3')] = 'libpkgconf7';
    command('apt-get', ['download', ...linuxPackages], { cwd: tools, timeout: 600000 });
    const receipt = [];
    for (const name of fs.readdirSync(tools).filter(x => x.endsWith('.deb'))) {
      const file = path.join(tools, name); command('dpkg-deb', ['-x', file, sysroot]); receipt.push({ file: name, sha256: hash(file) });
    }
    fs.writeFileSync(path.join(sysroot, '.complete'), JSON.stringify(receipt, null, 2));
    fs.writeFileSync(path.join(sysroot, '.tom-0.3-audio'), '1');
  }
  process.env.PATH = [path.join(platform, 'cmake/bin'), path.join(platform, 'ninja'), path.join(sysroot, 'usr/bin'), process.env.PATH].join(path.delimiter);
  process.env.LD_LIBRARY_PATH = path.join(sysroot, 'usr/lib/x86_64-linux-gnu') + (process.env.LD_LIBRARY_PATH ? ':' + process.env.LD_LIBRARY_PATH : '');
  process.env.PKG_CONFIG_SYSROOT_DIR = sysroot;
  process.env.PKG_CONFIG_LIBDIR = path.join(sysroot, 'usr/lib/x86_64-linux-gnu/pkgconfig');
  const cmake = path.join(platform, 'cmake/bin/cmake');
  const configure = (source, name, options) => {
    const build = path.join(native, 'build', name);
    command(cmake, ['-S', source, '-B', build, '-G', 'Ninja', '-DCMAKE_BUILD_TYPE=Release', '-DCMAKE_INSTALL_PREFIX=' + native,
      '-DCMAKE_C_COMPILER=' + toolchain().clang, '-DCMAKE_PREFIX_PATH=' + native + ';' + path.join(sysroot, 'usr'),
      '-DCMAKE_C_FLAGS=-I' + path.join(sysroot, 'usr/include'), '-DCMAKE_INSTALL_RPATH=$ORIGIN', ...options], { timeout: 600000 });
    command(cmake, ['--build', build, '-j', '4'], { timeout: 600000 });
    command(cmake, ['--install', build], { timeout: 120000 });
  };
  process.stdout.write('Building SDL3 for Linux...\n');
  configure(path.join(sources, 'SDL3-3.4.16'), 'SDL3', [
    '-DSDL_SHARED=ON', '-DSDL_STATIC=OFF', '-DSDL_TESTS=OFF', '-DSDL_AUDIO=ON', '-DSDL_ALSA=ON', '-DSDL_ALSA_SHARED=ON', '-DSDL_PULSEAUDIO=ON', '-DSDL_PULSEAUDIO_SHARED=ON', '-DSDL_PIPEWIRE=OFF', '-DSDL_JACK=OFF', '-DSDL_CAMERA=OFF', '-DSDL_JOYSTICK=OFF',
    '-DSDL_HAPTIC=OFF', '-DSDL_SENSOR=OFF', '-DSDL_HIDAPI=OFF', '-DSDL_WAYLAND=OFF', '-DSDL_X11=ON', '-DSDL_OPENGL=OFF',
    '-DSDL_OPENGLES=OFF', '-DSDL_VULKAN=OFF', '-DSDL_GPU=OFF', '-DSDL_DBUS=OFF', '-DSDL_IBUS=OFF', '-DSDL_X11_XSCRNSAVER=OFF', '-DSDL_X11_XTEST=OFF',
  ]);
  process.stdout.write('Building SDL_ttf for Linux...\n');
  configure(path.join(sources, 'SDL3_ttf-3.2.2'), 'SDL3_ttf', ['-DBUILD_SHARED_LIBS=ON', '-DSDLTTF_VENDORED=OFF', '-DSDLTTF_HARFBUZZ=OFF', '-DSDLTTF_PLUTOSVG=OFF', '-DSDLTTF_SAMPLES=OFF',
    '-DFREETYPE_INCLUDE_DIR_freetype2=' + path.join(sysroot, 'usr/include/freetype2'),
    '-DFREETYPE_INCLUDE_DIR_ft2build=' + path.join(sysroot, 'usr/include/freetype2'),
    '-DFREETYPE_LIBRARY_RELEASE=' + path.join(sysroot, 'usr/lib/x86_64-linux-gnu/libfreetype.so'),
  ]);
  buildMpdecimal();
  const shared = path.join(sysroot, 'usr/lib/x86_64-linux-gnu');
  for (const name of fs.readdirSync(shared)) if (/^lib(?:freetype|png16|z|bz2|brotli(?:dec|common))\.so(?:\.|$)/.test(name)) fs.copyFileSync(path.join(shared, name), path.join(native, 'lib', name));
  const audioLibrary = /^lib(?:asound|pulse(?:common-[\d.]+)?|asyncns|sndfile|FLAC|mp3lame|mpg123|ogg|opus|vorbis(?:enc|file)?)\.so(?:\.|$)/;
  for (const directory of [shared,path.join(shared,'pulseaudio')]) for (const name of fs.readdirSync(directory)) if (audioLibrary.test(name)) {
    const dest = path.join(native,'lib',name);fs.copyFileSync(path.join(directory,name),dest);
    command(path.join(sysroot,'usr/bin/patchelf'),['--set-rpath','$ORIGIN',dest]);
  }
  fs.cpSync(path.join(sysroot,'usr/share/alsa'),path.join(native,'share/alsa'),{recursive:true});
  for (const pkg of ['libfreetype6', 'libpng16-16t64', 'zlib1g', 'libbrotli1', 'libbz2-1.0',...audioPackages]) {
    const license = path.join(sysroot, 'usr/share/doc', pkg, 'copyright');
    if (fs.existsSync(license)) fs.copyFileSync(license, path.join(native, pkg + '.LICENSE'));
  }
  for (const name of ['SDL3-3.4.16', 'SDL3_ttf-3.2.2']) fs.copyFileSync(path.join(sources, name, 'LICENSE.txt'), path.join(native, name + '.LICENSE'));
}
async function setup() {
  fs.mkdirSync(sources, { recursive: true }); fs.mkdirSync(native, { recursive: true });
  for (const key of ['yyjson', 'mpdecimal', ...(!windows ? ['sdlSource', 'ttfSource'] : [])]) {
    const archive = await download(config[key]);
    const dir = path.join(sources, config[key].file.replace(/\.tar\.gz$/, ''));
    if (!fs.existsSync(dir)) extract(archive, sources);
  }
  if (windows) await setupWindows(); else await setupLinux();
  buildYyjson();
  const build = path.join(native, 'build/tom-runtime');
  const cmake = path.join(platform, windows ? 'cmake/bin/cmake.exe' : 'cmake/bin/cmake');
  command(cmake, ['-S', path.join(root, 'tom-lang/runtime/stable'), '-B', build, '-G', 'Ninja',
    '-DCMAKE_BUILD_TYPE=Release', '-DCMAKE_C_COMPILER=' + toolchain().clang,
    '-DCMAKE_MAKE_PROGRAM=' + path.join(platform, windows ? 'ninja/ninja.exe' : 'ninja/ninja'),
    '-DCMAKE_PREFIX_PATH=' + native, '-DCMAKE_INSTALL_PREFIX=' + native]);
  command(cmake, ['--build', build, '-j', '4']); command(cmake, ['--install', build]);
  process.stdout.write('Native runtime dependencies ready: ' + native + '\n');
}
if (require.main === module) setup().catch(error => { process.stderr.write(error.stack + '\n'); process.exitCode = 1; });
module.exports = { setup, download };
