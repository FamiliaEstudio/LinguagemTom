'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {execute,rejection}=require('./helpers');
for(const optimize of ['-O0','-O2']) {
  test(`dynamic text: borrowed views follow growth and forwarding ${optimize}`,()=>{
    const r=execute(`DefFuncaoxLer[TxtxVista]yVazio
GerarTxtxVista
FimFuncao
DefFuncaoxAlterar[RefTextoxDestino,TxtxVista]yVazio
AnexarTxt[@Destino,l'${'é'.repeat(100)}']
ChamarxLer[@Vista]
AnexarTxt[@Destino,@Vista]
FimFuncao
DefRecursoxTextoyTextoCriar[l'🐈',4096]
ChamarxAlterar[@Texto,@Texto]
GerarTxtxTexto`,{optimize});
    assert.equal(r.status,0,r.stdout);assert.equal(r.stdout,('🐈'+'é'.repeat(100)).repeat(3));
  });
  test(`dynamic text: Unicode edits, self aliasing, bounds and limits ${optimize}`,()=>{
    const r=execute(`DefRecursoxTyTextoCriar[l'aé🐈z',128]
InserirTxt[@T,2,l'é']
SubstituirTrechoTxt[@T,0,1,l'Á']
RemoverTrechoTxt[@T,4,1]
GerarTxtxT
LocalizarTxt[@T,l'z',0]
CompararIgualxyInSd64x@ULTIMOy4
Exigir[@ULTIMO]
LocalizarTxt[@T,l'x',0]
CompararIgualxyInSd64x@ULTIMOy-1
Exigir[@ULTIMO]
RecortarTxt[@T,@T,1,3]
AnexarTxt[@T,@T]
InserirTxt[@T,1,@T]
GerarTxtxT
Tentar
RemoverTrechoTxt[@T,200,1]
CapturarxE
GerarTxtxl'|bounds'
FimTentar
DefRecursoxLyTextoCriar[l'antes',8]
Tentar
AnexarTxt[@L,l'muito']
CapturarxE
GerarTxtxL
FimTentar
DefStkFB8CxFyl'fixo'
CopiarTxt[@L,@F]
RecortarTxt[@F,@L,0,4]
GerarTxtxF`,{optimize});
    assert.equal(r.status,0,r.stdout);assert.equal(r.stdout,'Áééz'+'é'+'éééé'+'ééé'+'|boundsantesfixo');
  });
  test(`dynamic text: one million Unicode codepoints and JSON roundtrip ${optimize}`,()=>{
    const r=execute(`DefRecursoxTyTextoCriar[l'${'á🐈é'.repeat(250)}',67108864]
ParaxI[0,10,1]
AnexarTxt[@T,@T]
FimPara
QuantidadeCaracteresTxt[@T]
CompararIgualxyInUd64x@ULTIMOy1024000
Exigir[@ULTIMO]
DefRecursoxJyJsonCriar[67108864]
JsonDefinirTexto[@J,l'/texto',@T]
DefRecursoxSaidayTextoCriar[l'',67108864]
JsonEscrever[@J,@Saida]
DefRecursoxJy2yJsonLer[@Saida,67108864]
JsonObterTexto[@Jy2,l'/texto',@Saida]
TextosIguais[@T,@Saida]
Exigir[@ULTIMO]
GerarTxtxl'OK'`,{optimize});
    assert.equal(r.status,0,r.stdout);assert.equal(r.stdout,'OK');
  });
}
test('dynamic text: read-only borrowing and fixed capacities remain checked',()=>{
  rejection("DefFuncaoxF[TextoxT]yVazio\nAnexarTxt[@T,l'x']\nFimFuncao",'E_BORROW');
  rejection("DefFuncaoxF[RefFB8CxT]yVazio\nFimFuncao\nDefRecursoxTyTextoCriar[l'',1024]\nChamarxF[@T]",'E_TYPE');
  rejection("DefFuncaoxF[RefTextoxT]yVazio\nFimFuncao\nDefStkFB8CxTyl''\nChamarxF[@T]",'E_TYPE');
});

test('dynamic file reads grow but preserve the destination on capacity failure',()=>{
  const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'tom-dynamic-data-'));
  try {
    const r=execute(`DefRecursoxDadosyDadosUsuarioCriar[l'TomTests',l'TextoDinamico']
DefRecursoxOrigemyTextoCriar[l'${'é🐈'.repeat(256)}',65536]
DadosGravar[@Dados,l'texto.txt',@Origem]
DefRecursoxDestinoyTextoCriar[l'antes',65536]
DadosLer[@Dados,l'texto.txt',65535,@Destino]
TextosIguais[@Origem,@Destino]
Exigir[@ULTIMO]
CopiarTxt[@Destino,l'antes']
Tentar
DadosLer[@Dados,l'texto.txt',3,@Destino]
GerarTxtxl'BAD'
CapturarxErro
GerarTxtxDestino
FimTentar`,{events:'',environment:{TOM_DATA_DIRECTORY:dir}});
    assert.equal(r.status,0,r.stdout);assert.equal(r.stdout,'antes');
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('unused functions reading borrowed Texto still declare their runtime dependency',()=>{
  const r=execute("DefFuncaoxLer[TextoxT]yVazio\nGerarTxtxT\nFimFuncao\nGerarTxtxl'OK'");
  assert.equal(r.status,0,r.stdout);assert.equal(r.stdout,'OK');
});
