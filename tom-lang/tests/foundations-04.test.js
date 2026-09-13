'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { execute, rejection, success } = require('./helpers');
const { compile } = require('../core/compiler');

const definitions = `DefEnumxFase
ItemxPronta
ItemxPausada
FimDef
DefRegistroxSaldo
PropDc34xvalor
PropInSd64xinstante
FimDef
DefRegistroxEstado
PropRegistro<Saldo>xsaldo
PropEnum<Fase>xfase
PropBlxativo
FimDef`;

for (const optimize of ['-O0', '-O2']) {
  test(`0.4: registros aninhados, cópias, empréstimos e retorno antes de Defer ${optimize}`, () => {
    const result = execute(`${definitions}
DefFuncaoxCopiar[Registro<Estado>xDado]yRegistro<Estado>
DeferSetVarDc34xDado.saldo.valory99
SetVarDc34xDado.saldo.valory0.3
Retornarx@Dado
FimFuncao
DefFuncaoxAlterar[RefRegistro<Estado>xDado]yVazio
SetVarEnum<Fase>xDado.fasey@Fase.Pausada
SetVarInSd64xDado.saldo.instantey9007199254740993
FimFuncao
DefVarRegistro<Estado>xOriginalyPadrao
CompararIgualxyDc34x@Original.saldo.valory0
Exigir[@ULTIMO]
SetVarDc34xOriginal.saldo.valory0.1
ChamarxCopiar[@Original]
DefVarRegistro<Estado>xCopiay@ULTIMO
CompararIgualxyDc34x@Original.saldo.valory0.1
Exigir[@ULTIMO]
CompararIgualxyDc34x@Copia.saldo.valory0.3
Exigir[@ULTIMO]
ChamarxAlterar[@Copia]
CompararIgualxyEnum<Fase>x@Copia.fasey@Fase.Pausada
Exigir[@ULTIMO]
CompararIgualxyInSd64x@Copia.saldo.instantey9007199254740993
Exigir[@ULTIMO]
SetVarRegistro<Estado>xCopiay@Copia
CompararIgualxyDc34x@Copia.saldo.valory0.3
Exigir[@ULTIMO]
GerarTxtxl'OK'`, { optimize });
    assert.equal(result.status, 0, result.stdout); assert.equal(result.stdout, 'OK');
  });
  test(`0.4: erros e retornos atravessam a limpeza de Para ${optimize}`, () => {
    const result = execute(`${definitions}
DefFuncaoxSair[]yInSd64
ParaxI[0,2,1]
DefVarRegistro<Estado>xLocalyPadrao
DeferGerarTxtxl'A'
DeferGerarTxtxl'B'
Retornarx@I
FimPara
Retornarx99
FimFuncao
ChamarxSair[]
CompararIgualxyInSd64x@ULTIMOy0
Exigir[@ULTIMO]
DefVarInSd64xZeroy0
Tentar
ParaxJ[0,3,1]
DefVarRegistro<Estado>xLocalyPadrao
DeferGerarTxtxl'C'
DividxyInSd64x1y@Zero
FimPara
CapturarxErro
GerarTxtxl'D'
FimTentar`, { optimize, maximumLiveObjects: 12 });
    assert.equal(result.status, 0, result.stdout); assert.equal(result.stdout, 'BACD');
  });
  test(`0.4: Para cleanup, indices e incremento terminal ampliado ${optimize}`, () => {
    const result = execute(`${definitions}
DefVarInSd64xSomay0
ParaxI[0,1000,1]
DefVarRegistro<Estado>xLocalyPadrao
DeferSetVarDc34xLocal.saldo.valory1
SomarxyInSd64x@Somay@I
SetVarInSd64xSomay@ULTIMO
Continuar
FimPara
CompararIgualxyInSd64x@Somay499500
Exigir[@ULTIMO]
ParaxMax[9223372036854775806,9223372036854775807,9223372036854775807]
GerarTxtxl'A'
FimPara
ParaxMin[-9223372036854775807,-9223372036854775808,-9223372036854775808]
GerarTxtxl'B'
FimPara
DefStructSOAxFila
PropEnum<Fase>xfase
PropIn64xvalor
FimDef
DefArraySoAxItensxFilax3
ParaIndiceSOAxJ[@Itens]
SetVarInSd64xItens@@J.valory@J
SetVarEnum<Fase>xItens@@J.fasey@Fase.Pausada
FimPara
SOAComprimento[@Itens]
CompararIgualxyInSd64x@ULTIMOy3
Exigir[@ULTIMO]
GerarTxtxl'OK'`, { optimize, maximumLiveObjects: 12 });
    assert.equal(result.status, 0, result.stdout); assert.equal(result.stdout, 'ABOK');
  });
}

test('0.4: diagnósticos de tipos, ciclos, enumerações e limites de bloco', () => {
  rejection('DefRegistroxA\nPropRegistro<A>xfilho\nFimDef', 'E_TYPE_CYCLE');
  rejection('DefVarRegistro<Ausente>xAyPadrao', 'E_TYPE');
  rejection(`${definitions}\nDefConstRegistro<Estado>xAyPadrao`, 'E_TYPE');
  rejection(`${definitions}\nDefVarEnum<Fase>xFy0`, 'E_LITERAL');
  rejection(`${definitions}\nCompararMenorxyEnum<Fase>x@Fase.Prontay@Fase.Pausada`, 'E_TYPE');
  rejection(`${definitions}\nDefVarRegistro<Estado>xAyPadrao\nSetVarDc34xA.saldo.valory@A.saldo.instante`, 'E_TYPE');
  rejection('ParaxI[0,2,0]\nFimPara', 'E_LOOP_STEP');
  rejection('ParaxI[0,2,1]\nSetVarInSd64xIy8\nFimPara', 'E_CONSTANT');
  rejection('ParaxI[0,2,1]\nSomarxyInSd64x@Iy1\nFimPara\nDefVarInSd64xAy@ULTIMO', 'E_ULTIMO');
});

test('0.4: módulos exportam registros e enumerações sem executar inicialização', () => {
  const result = compile("Importar[l'./tipos.tom']\nDefVarRegistro<Estado>xEyPadrao", { file: 'main.tom', modules: { 'tipos.tom': definitions } });
  assert.equal(result.success, true, JSON.stringify(result.diagnostics));
  success(`${definitions}\nDefFuncaoxIndice[SOA<Fila>xItens]yInSd64\nSOAComprimento[@Itens]\nRetornarx@ULTIMO\nFimFuncao\nDefStructSOAxFila\nPropIn64xvalor\nFimDef`);
});

for (const optimize of ['-O0', '-O2']) test(`0.4: falha na segunda cópia decimal preserva todo o registro ${optimize}`, () => {
  const r = execute(`DefRegistroxPar
PropDc34xa
PropDc34xb
PropInSd64xnumero
FimDef
DefVarRegistro<Par>xOrigemyPadrao
DefVarRegistro<Par>xDestinoyPadrao
SetVarDc34xOrigem.ay0.1
SetVarDc34xOrigem.by0.2
SetVarInSd64xOrigem.numeroy42
SetVarDc34xDestino.ay10
SetVarDc34xDestino.by20
SetVarInSd64xDestino.numeroy7
Tentar
Exigir[Verdadeiro]
SetVarRegistro<Par>xDestinoy@Origem
GerarTxtxl'FALHOU'
CapturarxErro
ErroCodigoxErro
CompararIgualxyInSd32x@ULTIMOy7
Exigir[@ULTIMO]
GerarTxtxl'CAPTURADO'
FimTentar
CompararIgualxyDc34x@Destino.ay10
Exigir[@ULTIMO]
CompararIgualxyDc34x@Destino.by20
Exigir[@ULTIMO]
CompararIgualxyInSd64x@Destino.numeroy7
Exigir[@ULTIMO]
SetVarRegistro<Par>xDestinoy@Origem
CompararIgualxyDc34x@Destino.by0.2
Exigir[@ULTIMO]`, { optimize,
    nativeSources: [require('node:path').join(__dirname, 'record-copy-fault.c')],
    linkFlags: ['-Wl,--wrap=tom_decimal_copy', '-Wl,--wrap=tom_require'], maximumLiveObjects: 16 });
  assert.equal(r.status, 0, r.stdout); assert.equal(r.stdout, 'CAPTURADO');
});
