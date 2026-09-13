'use strict';
// Empacota somente o executável que já passou pela verificação de desktop.
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { app } = require('./build');
const windows = process.platform === 'win32';
const platform = windows ? 'windows' : 'linux';
const optimize = process.argv.includes('--O0') ? 'O0' : 'O2';
const directory = path.join(app, 'build', platform, 'package' + (optimize === 'O0' ? '-O0' : ''));
const digest = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
try {
  const receipt = JSON.parse(fs.readFileSync(path.join(directory, 'verification.json'), 'utf8'));
  const binary = path.join(directory, 'musical-tom', windows ? 'musical-tom.exe' : 'musical-tom');
  if (receipt.status !== 'passed' || !receipt.production || receipt.sha256 !== digest(binary)) {
    throw Error('O executável atual ainda não tem verificação de produção aprovada.');
  }
  const destination = path.join(app, 'build', 'dist');
  fs.mkdirSync(destination, { recursive: true });
  const name = `musical-tom-0.1.0-${platform}-${process.arch}-${optimize}.${windows ? 'zip' : 'tar.gz'}`;
  const file = path.join(destination, name), temporary = file + '.tmp';
  try {
    const result = spawnSync('cmake', ['-E', 'tar', windows ? 'cf' : 'czf', temporary,
      '--format=' + (windows ? 'zip' : 'gnutar'), '--', 'musical-tom'], { cwd: directory, encoding: 'utf8' });
    if (result.error) throw result.error;
    if (result.status !== 0) throw Error(result.stderr || 'Falha ao criar o arquivo de distribuição.');
    fs.renameSync(temporary, file);
    fs.writeFileSync(file + '.sha256', `${digest(file)}  ${name}\n`);
    console.log(file);
  } finally { fs.rmSync(temporary, { force: true }); }
} catch (error) { console.error(error.message); process.exitCode = 1; }
