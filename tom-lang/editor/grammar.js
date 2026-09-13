'use strict';
// The checked-in TextMate grammar is generated from the compiler's type/ABI names.
const { TYPE_PATTERN } = require('../core/types');
const { builtins } = require('../core/builtins');
const { RESOURCE_PATTERN } = require('../core/resources');
const ID = '[A-Za-z_][A-Za-z0-9_]*';
const TYPE = `(?:${TYPE_PATTERN}|FB\\d+[CU]?|${RESOURCE_PATTERN}|SOA<${ID}>|Txt|Vazio)`;
const START = '(?:^\\s*|(?<=Defer))';
const scopes = {
  keyword: 'keyword.control.tom', type: 'support.type.tom', function: 'entity.name.function.tom',
  builtin: 'support.function.tom', variable: 'variable.other.readwrite.tom', parameter: 'variable.parameter.tom',
  property: 'variable.other.property.tom', label: 'entity.name.label.tom', separator: 'punctuation.separator.tom',
};
const captures = (...names) => Object.fromEntries(names.map((name, i) => [i + 1, { name: scopes[name] || name }]));
const rule = (match, ...names) => ({ match, captures: captures(...names) });
const alternatives = names => names.sort((a, b) => b.length - a.length).join('|');
function createGrammar() {
  return {
    name: 'Tom', scopeName: 'source.tom',
    patterns: [
      { include: '#strings' }, { include: '#comments' },
      { name: 'keyword.control.tom', match: '^\\s*Defer' },
      {
        begin: `${START}(DefFuncao)(x)(${ID})(\\[)`,
        beginCaptures: captures('keyword', 'separator', 'function', 'punctuation.section.parameters.begin.tom'),
        end: `(\\])(y)(${TYPE})?|$`,
        endCaptures: captures('punctuation.section.parameters.end.tom', 'separator', 'type'),
        patterns: [
          rule(`(Ref)?(${TYPE})(x)(${ID})(?=\\s*(?:,|\\]|$))`, 'storage.modifier.tom', 'type', 'separator', 'parameter'),
          { name: 'punctuation.separator.parameters.tom', match: ',' },
          { include: '#comments' },
        ],
      },
      rule(`${START}(Importar|ComprimentoSOA|SOAComprimento)(?=\\[)`, 'keyword'),
      rule(`${START}(ParaIndiceSOA|Para)(x)(${ID})(?=\\[)`, 'keyword', 'separator', 'variable.other.constant.tom'),
      rule(`${START}(Chamar)(x)(${ID})(?=\\[|$)`, 'keyword', 'separator', 'function'),
      rule(`${START}(DefConst)(${TYPE})(x)(${ID})(y)(?=@|[-0-9]|Verdadeiro|Falso)`, 'keyword', 'type', 'separator', 'variable.other.constant.tom', 'separator'),
      rule(`${START}(DefVar|SetVar)(${TYPE})(x)(${ID})(y)(?=@|[-0-9]|Verdadeiro|Falso|Padrao)`, 'keyword', 'type', 'separator', 'variable', 'separator'),
      {
        begin: `${START}(SetVar)(${TYPE})(x)(${ID})(?=\\.)`,
        beginCaptures: captures('keyword','type','separator','variable'),
        end: '(y)(?=@|[-0-9]|Verdadeiro|Falso|Padrao)|$', endCaptures: captures('separator'),
        patterns: [rule(`(\\.)(${ID}?)(?=\\.|y(?:@|[-0-9]|Verdadeiro|Falso|Padrao)|$)`, 'punctuation.accessor.tom','property')],
      },
      // SOA assignment: preserve the receiver, index and field as distinct tokens.
      rule(`${START}(SetVar)(${TYPE})(x)(?=${ID}@)`, 'keyword', 'type', 'separator'),
      rule(`${START}(DefTxt|SetTxt|SomarTxt)(x)(${ID})(y)(?=l')`, 'keyword', 'separator', 'variable', 'separator'),
      rule(`${START}(DefStk|Somarl)(FB\\d+[CU]?)(x)(${ID})(y)(?=l')`, 'keyword', 'type', 'separator', 'variable', 'separator'),
      rule(`${START}(DefRecurso)(x)(${ID})(y)(${alternatives(Object.keys(builtins))})(?=\\[)`, 'keyword', 'separator', 'variable', 'separator', 'builtin'),
      rule(`${START}(${alternatives(Object.keys(builtins))})(?=\\[)`, 'builtin'),
      rule(`${START}(GerarTxt)(x)(?=l')`, 'keyword', 'separator'),
      rule(`${START}(GerarTxt)(x)(${ID})(?=\\s*(?://|$))`, 'keyword', 'separator', 'variable'),
      rule(`${START}(LerEntrada)(${TYPE})(x)(${ID})(?=\\s*(?://|$))`, 'keyword', 'type', 'separator', 'variable'),
      rule(`${START}(Capturar|ErroCodigo|ErroMensagem|ErroArquivo|ErroLinha|ErroColuna)(x)(${ID})(?=\\s*(?://|$))`, 'keyword', 'separator', 'variable'),
      rule(`${START}(EscopoIni|EscopoFim)(x)(${ID})(?=\\s*(?://|$))`, 'keyword', 'separator', 'label'),
      rule(`${START}(DefStructSOA|DefRegistro|DefEnum)(x)(${ID})(?=\\s*(?://|$))`, 'keyword', 'separator', 'entity.name.type.struct.tom'),
      rule(`${START}(Item)(x)(${ID})(?=\\s*(?://|$))`, 'keyword', 'separator', 'constant.other.enum.tom'),
      rule(`${START}(Prop)(In(?:32|64)|${TYPE_PATTERN})(x)(${ID})(?=\\s*(?://|$))`, 'keyword', 'type', 'separator', 'property'),
      rule(`${START}(DefArraySoA)(x)(${ID})(x)(${ID})(x)(\\d+)`, 'keyword', 'separator', 'variable', 'separator', 'type', 'separator', 'constant.numeric.tom'),
      rule(`${START}(AlocSOA)(x)(${ID})(x)(${ID})(xy?)(\\d+)`, 'keyword', 'separator', 'type', 'separator', 'variable', 'separator', 'constant.numeric.tom'),
      rule(`${START}(GetVar)(x)(${ID})(xIndex)(@${ID}|-?\\d+)(x)(${ID})`, 'keyword', 'separator', 'variable', 'separator', 'variable.other.index.tom', 'separator', 'property'),
      rule(`${START}(ParaCadaSOA)(x)(${ID})(xSomar)(${ID})(-?\\d+)(?=\\s*(?://|$))`, 'keyword', 'separator', 'variable', 'keyword', 'property', 'constant.numeric.tom'),
      rule(`${START}(Somar|Subtr|Multi|Divid)(Vec4In(?:32|64))(x)`, 'keyword', 'type', 'separator'),
      rule(`${START}(Somar|Subtr|Multi|Divid|SeMaior|Comparar(?:Igual|Diferente|MenorIgual|MaiorIgual|Menor|Maior)|Ou|E)(xy)(${TYPE})(x)`, 'keyword', 'separator', 'type', 'separator'),
      rule(`${START}(Somarl)(I8|UT|FB\\d+[CU]?)(xyx)`, 'keyword', 'type', 'separator'),
      rule(`${START}(Nao)(Bl)(x)`, 'keyword', 'type', 'separator'),
      rule(`${START}(Se|Enquanto|Retornar)(x)`, 'keyword', 'separator'),
      { name: 'keyword.control.tom', match: `${START}(?:Senao|FimSe|FimEnquanto|FimPara|Interromper|Continuar|Tentar|FimTentar|Relancar|FimFuncao|FimDef|Retornar|GerarTxtUltimo)(?=\\s*(?://|$))` },
      { name: 'invalid.deprecated.tom', match: '^\\s*(?:@\\w+|Gpu\\w*|DefKernel\\w*|Comp\\w*|Inseguro|FimInseguro|Zona\\w*|DefZn\\w*|AlocHp\\w*|LiberHp\\w*|DefBudget\\w*|DefPrioridad\\w*)' },
      { include: '#operands' },
    ],
    repository: {
      comments: { name: 'comment.line.double-slash.tom', match: '//.*$' },
      strings: {
        name: 'string.quoted.single.tom', begin: "l'", end: "'|$",
        patterns: [{ name: 'constant.character.escape.tom', match: "\\\\[nrt'\\\\]" }],
      },
      operands: { patterns: [
        {
          begin: `(@)(${ID})(?=\\.)`, beginCaptures: captures('punctuation.definition.variable.tom','variable'),
          end: '(?=y(?:@|-?\\d|Verdadeiro|Falso)|\\s|,|\\]|$)',
          patterns: [rule(`(\\.)(${ID}?)(?=\\.|y(?:@|-?\\d|Verdadeiro|Falso)|\\s|,|\\]|$)`, 'punctuation.accessor.tom','property')],
        },
        rule(`(${ID})(@)(@${ID}|-?\\d+)(\\.)(${ID}?)(?=y(?:@|-?\\d|Verdadeiro|Falso)|\\s|,|\\]|$)`, 'variable', 'separator', 'variable.other.index.tom', 'punctuation.accessor.tom', 'property'),
        // x/y delimiters are not identifier boundaries in Tom; end references at
        // the operand separator when it is followed by a literal or another @.
        { name: 'variable.language.tom', match: '@ULTIMO(?=y(?:@|-?\\d|Verdadeiro|Falso)|[^A-Za-z0-9_]|$)' },
        rule(`(@)(${ID}?)(?=y(?:@|-?\\d|Verdadeiro|Falso)|[^A-Za-z0-9_]|$)`, 'punctuation.definition.variable.tom', 'variable'),
        { name: 'constant.language.boolean.tom', match: '(?:Verdadeiro|Falso)(?=y|[^A-Za-z0-9_]|$)' },
        { name: 'constant.language.tom', match: 'Padrao(?=\\s|,|\\]|$)' },
        { name: 'constant.numeric.tom', match: '-?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?' },
        { name: 'punctuation.separator.tom', match: '[xy,]' },
        { name: 'punctuation.section.arguments.tom', match: '[\\[\\]]' },
      ] },
    },
  };
}
module.exports = { createGrammar };
if (require.main === module) {
  require('node:fs').writeFileSync(require('node:path').join(__dirname, '../syntaxes/tom.tmGrammar.json'), JSON.stringify(createGrammar(), null, 2) + '\n');
}
