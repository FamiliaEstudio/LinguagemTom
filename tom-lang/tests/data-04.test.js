'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execute } = require('./helpers');

for (const optimize of ['-O0', '-O2']) {
  test(`0.4 JSON: inteiro exato, decimal, float, Unicode e roundtrip ${optimize}`, () => {
    const result = execute(`DefRecursoxDocyJsonLer[l'{"i":9007199254740993,"max":18446744073709551615,"d":0.1,"f":0.1}',1048576]
JsonObterInSd64[@Doc,l'/i']
CompararIgualxyInSd64x@ULTIMOy9007199254740993
Exigir[@ULTIMO]
JsonObterInUd64[@Doc,l'/max']
CompararIgualxyInUd64x@ULTIMOy18446744073709551615
Exigir[@ULTIMO]
JsonObterDc34[@Doc,l'/d']
SomarxyDc34x@ULTIMOy0.2
CompararIgualxyDc34x@ULTIMOy0.3
Exigir[@ULTIMO]
JsonObterFl64[@Doc,l'/f']
CompararIgualxyFl64x@ULTIMOy0.1
Exigir[@ULTIMO]
JsonDefinirTexto[@Doc,l'/texto',l'Ação ♫ %s %n']
JsonDefinirArray[@Doc,l'/lista']
JsonDefinirInSd64[@Doc,l'/lista/-',-9223372036854775808]
JsonDefinirTexto[@Doc,l'/a~1b~0c',l'OK']
DefStkFB1024CxSaidayl''
JsonEscrever[@Doc,@Saida]
DefRecursoxCopiayJsonLer[@Saida,1048576]
JsonObterInSd64[@Copia,l'/lista/0']
CompararIgualxyInSd64x@ULTIMOy-9223372036854775808
Exigir[@ULTIMO]
JsonObterTexto[@Copia,l'/texto',@Saida]
GerarTxtxSaida
JsonObterTexto[@Copia,l'/a~1b~0c',@Saida]
GerarTxtxSaida`, { optimize });
    assert.equal(result.status,0,result.stdout);assert.equal(result.stdout,'Ação ♫ %s %nOK');
  });
  test(`0.4 JSON: erros não alteram documento ou buffer ${optimize}`, () => {
    const result=execute(`DefRecursoxDocyJsonLer[l'{"valor":1}',4096]
DefStkFB8CxBufyl'antes'
Tentar
JsonDefinirTexto[@Doc,l'/valor',l'${'X'.repeat(8192)}']
CapturarxErro
ErroCodigoxErro
CompararIgualxyInSd32x@ULTIMOy5
Exigir[@ULTIMO]
FimTentar
JsonObterInSd64[@Doc,l'/valor']
CompararIgualxyInSd64x@ULTIMOy1
Exigir[@ULTIMO]
Tentar
JsonEscrever[@Doc,@Buf]
CapturarxErro
GerarTxtxBuf
FimTentar
DefRecursoxRepetidoyJsonCriar[262144]
ParaxI[0,100,1]
JsonDefinirInSd64[@Repetido,l'/valor',@I]
FimPara
JsonObterInSd64[@Repetido,l'/valor']
CompararIgualxyInSd64x@ULTIMOy99
Exigir[@ULTIMO]`, { optimize });
    assert.equal(result.status,0,result.stdout);assert.equal(result.stdout,'antes');
  });
}

test('0.4 JSON: entradas completas, chaves duplicadas, NUL, faixa e capacidade', () => {
  const inputs=['{"a":1,"a":2}','{"a":{"b":1,"b":2}}','{} {}','{"a":NaN}','[1,]','{"a":"\\u0000"}'];
  for(const input of inputs) {
    const source=`Tentar\nDefRecursoxDyJsonLer[l'${input.replaceAll('\\','\\\\')}',65536]\nGerarTxtxl'BAD'\nCapturarxErro\nGerarTxtxl'OK'\nFimTentar`;
    const r=execute(source);assert.equal(r.status,0,r.stdout);assert.equal(r.stdout,'OK');
  }
});

test('0.4 arquivos: Unicode, escrita atômica e leitura sem alterações parciais', () => {
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'tom-data-'));
  const application='tom-test-'+process.pid;
  const location=process.platform==='win32'?path.join(process.env.APPDATA,'TomTests',application):path.join(directory,application);
  try {
    const r=execute(`DefRecursoxDadosyDadosUsuarioCriar[l'TomTests',l'${application}']
DadosGravar[@Dados,l'configuração.json',l'{"nome":"Ação ♫ %s %n"}']
DadosExiste[@Dados,l'configuração.json']
Exigir[@ULTIMO]
DefStkFB128CxSaidayl'antes'
Tentar
DadosLer[@Dados,l'configuração.json',3,@Saida]
CapturarxErro
GerarTxtxSaida
FimTentar
DadosLer[@Dados,l'configuração.json',127,@Saida]
GerarTxtxSaida
Tentar
DadosGravar[@Dados,l'../indevido',l'BAD']
CapturarxErro
GerarTxtxl'OK'
FimTentar`,{environment:{XDG_DATA_HOME:directory}});
    assert.equal(r.status,0,r.stdout);assert.equal(r.stdout,'antes{"nome":"Ação ♫ %s %n"}OK');
  } finally { fs.rmSync(directory,{recursive:true,force:true}); if(process.platform==='win32')fs.rmSync(location,{recursive:true,force:true}); }
});
