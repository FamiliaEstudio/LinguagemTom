'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const manifest = require('../exemplos/manifest.json');
const { compile } = require('../core/compiler');
const { loadModules } = require('../core/module-loader');
const { execute } = require('./helpers');

for (const example of manifest) {
  test(`example ${example.file}: ${example.status}`, () => {
    const file = path.resolve(__dirname, '../exemplos', example.file);
    const source = fs.readFileSync(file, 'utf8');
    if (example.status === 'experimental') {
      const result = compile(source, { file });
      assert.equal(result.success, false);
      assert.equal(result.diagnostics[0].code, example.diagnostic);
      assert.deepEqual(result.artifacts, {});
    } else if (example.status === 'library') {
      const program = "Importar[l'./" + path.basename(file) + "']";
      const result = compile(program,{file:path.join(path.dirname(file),'module-test.tom'),modules:loadModules(program,path.join(path.dirname(file),'module-test.tom'))});
      assert.equal(result.success,true,JSON.stringify(result.diagnostics));
    } else {
      for (const optimize of ['-O0', '-O2']) {
        const result = execute(source, { file, modules:loadModules(source,file), assets:example.assets ? path.resolve(path.dirname(file),example.assets) : undefined, input: example.stdin, optimize, events: example.events, environment: example.gui ? { SDL_VIDEODRIVER: "dummy", SDL_RENDER_DRIVER: "software", SDL_AUDIODRIVER: "dummy" } : {} });
        assert.equal(result.status, example.exitCode, result.stdout + result.stderr);
        assert.equal(result.stdout, example.stdout);
      }
    }
  });
}

test('every checked-in example is classified', () => {
  const root = path.resolve(__dirname, '..');
  const classified = new Set(manifest.map(x => path.resolve(root, 'exemplos', x.file)));
  for (const directory of [root, path.join(root, 'exemplos'), path.join(root, 'exemplos/multimedia'), path.join(root, 'exemplos/estado'), path.join(root, 'experimental/examples')]) {
    for (const name of fs.readdirSync(directory).filter(x => x.endsWith('.tom'))) {
      assert.ok(classified.has(path.join(directory, name)), `Classifique ${name} em exemplos/manifest.json.`);
    }
  }
});
