'use strict';
const test=require('node:test');const {run}=require('./helpers');
const fixture=require('./replay-fixture');
for(const optimize of ['-O0','-O2'])test(`musical: mesmo julgamento a 30/60/144 FPS, pausa e 900ms de atraso ${optimize}`,()=>run(fixture,optimize));
