'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const manifest = require('../exemplos/manifest.json');
const { compile } = require('../core/compiler');
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
    } else {
      for (const optimize of ['-O0', '-O2']) {
        const result = execute(source, { file, input: example.stdin, optimize, events: example.events, environment: example.gui ? { SDL_VIDEODRIVER: "dummy", SDL_RENDER_DRIVER: "software" } : {} });
        assert.equal(result.status, example.exitCode);
        assert.equal(result.stdout, example.stdout);
      }
    }
  });
}

test('every checked-in example is classified', () => {
  const root = path.resolve(__dirname, '..');
  const classified = new Set(manifest.map(x => path.resolve(root, 'exemplos', x.file)));
  for (const directory of [root, path.join(root, 'exemplos'), path.join(root, 'experimental/examples')]) {
    for (const name of fs.readdirSync(directory).filter(x => x.endsWith('.tom'))) {
      assert.ok(classified.has(path.join(directory, name)), `Classifique ${name} em exemplos/manifest.json.`);
    }
  }
});
