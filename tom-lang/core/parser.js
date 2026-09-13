'use strict';
const { fail, readSource, decodeString } = require('./source');
const { TYPE_PATTERN, NUMBER_PATTERN, typeOf } = require('./types');
const { builtins } = require('./builtins');
const { resources, RESOURCE_PATTERN } = require('./resources');

const ID = '[A-Za-z_][A-Za-z0-9_]*';
const PATH = `${ID}(?:\\.${ID})*`;
const INDEX = `(?:@${PATH}|-?\\d+)`;
const ACCESS = `${ID}@${INDEX}\\.${ID}`;
const OPERAND = `(?:${ACCESS}|@${PATH}|${NUMBER_PATTERN}|Verdadeiro|Falso)`;
const TARGET = `(?:${ACCESS}|${PATH})`;
const TEXT = "l'((?:\\\\.|[^'\\\\])*)'";
const experimental = /^(?:@|Gpu|DefKernel|DefFuncao|FimFuncao|Comp|Inseguro|FimInseguro|Zona|DefZn|AlocHp|LiberHp|SEProv|SEImpr|DefBudget|DefPrioridad|AguardarGpu|Sincronizar|Para(?!CadaSOA)|FimPara)/;

function argumentsOf(raw, location) {
  if (!raw) return [];
  const args = []; let start = 0, quoted = false, escaped = false;
  for (let i = 0; i < raw.length; i++) {
    if (escaped) { escaped = false; continue; }
    if (quoted && raw[i] === '\\') { escaped = true; continue; }
    if (raw[i] === "'") quoted = !quoted;
    if (!quoted && raw[i] === ',') { args.push(raw.slice(start, i).trim()); start = i + 1; }
  }
  args.push(raw.slice(start).trim());
  if (quoted || args.some(x => !x)) fail('E_ARGUMENT', 'Lista de argumentos inválida.', location);
  return args;
}

function command(statement) {
  const { text, location } = statement;
  const node = (kind, fields = {}) => ({ kind, location, ...fields });
  const match = pattern => new RegExp(`^${pattern}$`).exec(text);
  let m;
  if ((m = match(`Importar\\[${TEXT}\\]`))) return node('import', { specifier: decodeString(m[1], location) });
  if ((m = match(`DefConst(${TYPE_PATTERN})x(${ID})y([^\\s]+)`))) {
    if (['decimal', 'record'].includes(typeOf(m[1]).kind)) fail('E_TYPE', 'Constantes Dc34 e Registro ainda não são suportadas.', location);
    return node('constant', { type: typeOf(m[1]), name: m[2], operand: m[3] });
  }
  if ((m = match(`DefFuncaox(${ID})\\[(.*)\\]y(${TYPE_PATTERN}|Vazio)`))) {
    const params = argumentsOf(m[2], location).map(raw => {
      const p = new RegExp(`^(Ref)?(${TYPE_PATTERN}|FB\\d+C|${RESOURCE_PATTERN}|Txt|SOA<${ID}>)x(${ID})$`).exec(raw);
      if (!p) fail('E_PARAMETER', `Parâmetro inválido: ${raw}`, location);
      const type = typeOf(p[2]);
      if (p[1] && !['buffer', 'resource', 'soa', 'record'].includes(type.kind)) fail('E_PARAMETER', 'Ref exige buffer, recurso, registro ou SOA.', location);
      return { name: p[3], type, mutable: !!p[1] };
    });
    return node('function', { name: m[1], params, result: m[3], body: [] });
  }
  if (text === 'FimFuncao') return node('endFunction');
  if ((m = match(`Chamarx(${ID})\\[(.*)\\]`))) return node('call', { name: m[1], args: argumentsOf(m[2], location) });
  if ((m = match(`Retornar(?:x(${OPERAND}))?`))) return node('return', { operand: m[1] });
  if ((m = match(`(Se|Enquanto)x(${OPERAND})`))) return node(m[1] === 'Se' ? 'if' : 'while', { condition: m[2], body: [], otherwise: [] });
  if ((m = match(`Parax(${ID})\\[(.*)\\]`))) {
    const args = argumentsOf(m[2], location);
    if (args.length !== 3) fail('E_ARGUMENT', 'Para exige início, fim exclusivo e passo.', location);
    return node('for', { name: m[1], args, body: [] });
  }
  if ((m = match(`ParaIndiceSOAx(${ID})\\[@(${ID})\\]`))) return node('for', { name: m[1], array: m[2], body: [] });
  if (text === 'FimPara') return node('endFor');
  const blocks = { Senao: 'else', FimSe: 'endIf', FimEnquanto: 'endWhile', Interromper: 'break', Continuar: 'continue', Tentar: 'try', FimTentar: 'endTry', Relancar: 'rethrow' };
  if (blocks[text]) return node(blocks[text], blocks[text] === 'try' ? { body: [], handler: [] } : {});
  if ((m = match(`Capturarx(${ID})`))) return node('catch', { name: m[1] });
  if ((m = match(`Erro(Codigo|Linha|Coluna|Mensagem|Arquivo)x(${ID})`))) return node('errorField', { field: m[1], name: m[2] });
  if ((m = match(`Comparar(Igual|Diferente|MenorIgual|MaiorIgual|Menor|Maior)xy(${TYPE_PATTERN})x(${OPERAND})y(${OPERAND})`))) return node('compare', { op: m[1], type: typeOf(m[2]), left: m[3], right: m[4] });
  if ((m = match(`(E|Ou)xyBlx(${OPERAND})y(${OPERAND})`))) return node('boolean', { op: m[1], left: m[2], right: m[3] });
  if ((m = match(`NaoBlx(${OPERAND})`))) return node('boolean', { op: 'Nao', left: m[1] });
  if ((m = match(`DefRecursox(${ID})y(${ID})\\[(.*)\\]`))) {
    if (!builtins[m[2]] || !resources[builtins[m[2]].result]) fail('E_RESOURCE', 'Construtor de recurso inválido.', location);
    return node('resource', { name: m[1], builtin: m[2], args: argumentsOf(m[3], location) });
  }
  if ((m = match(`(${ID})\\[(.*)\\]`)) && builtins[m[1]]) return node('builtin', { name: m[1], args: argumentsOf(m[2], location) });
  if ((m = match(`(?:ComprimentoSOA|SOAComprimento)\\[(@${ID})\\]`))) return node('arrayLength', { name: m[1].slice(1) });
  if (experimental.test(text)) fail('E_EXPERIMENTAL', 'Recurso experimental indisponível no compilador estável.', location);
  if ((m = match(`EscopoInix(${ID})`))) {
    if (['MainLoop', 'Comptime'].includes(m[1])) fail('E_EXPERIMENTAL', `Escopo ${m[1]} é experimental.`, location);
    return node('scope', { name: m[1], body: [] });
  }
  if ((m = match(`EscopoFimx(${ID})`))) return node('endScope', { name: m[1] });
  if (text.startsWith('Defer')) {
    const child = command({ text: text.slice(5), location: { ...location, column: location.column + 5 } });
    if (!['set', 'math', 'print', 'printLast', 'printName', 'call', 'builtin', 'bufferAppend'].includes(child.kind)) {
      fail('E_DEFER', 'Defer aceita atribuição numérica, aritmética ou impressão.', location);
    }
    if ([child.operand, child.left, child.right, ...(child.args || [])].includes('@ULTIMO') || child.kind === 'printLast') fail('E_DEFER', 'Defer exige operandos explícitos, sem ULTIMO.', location);
    return node('defer', { child });
  }
  if ((m = match(`(DefVar|SetVar)(${TYPE_PATTERN})x(${TARGET})y([^\\s]+)`))) {
    if (m[1] === 'DefVar' && !new RegExp(`^${ID}$`).test(m[3])) fail('E_NAME', 'Nome inválido para declaração.', location);
    return node(m[1] === 'DefVar' ? 'declare' : 'set', { type: typeOf(m[2]), name: m[3], operand: m[4] });
  }
  if ((m = match(`(Somar|Subtr|Multi|Divid)xy(${TYPE_PATTERN})x(${OPERAND})y(${OPERAND})`))) {
    if (['bool', 'enum', 'record'].includes(typeOf(m[2]).kind)) fail('E_TYPE', `${m[2]} não admite aritmética.`, location);
    return node('math', { op: m[1], type: typeOf(m[2]), left: m[3], right: m[4] });
  }
  if ((m = match(`SeMaiorxy(In(?:Sd|Ud)(?:32|64))x(${OPERAND})y(${OPERAND})`))) {
    return node('guard', { type: typeOf(m[1]), left: m[2], right: m[3] });
  }
  if ((m = match(`LerEntrada(In(?:Sd|Ud)(?:32|64))x(${ID})`))) return node('read', { type: typeOf(m[1]), name: m[2] });
  if ((m = match(`(DefTxt|SetTxt|SomarTxt)x(${ID})y${TEXT}`))) {
    return node({ DefTxt: 'textDeclare', SetTxt: 'textSet', SomarTxt: 'textAppend' }[m[1]], { name: m[2], text: decodeString(m[3], location) });
  }
  if ((m = match(`(DefStk|Somarl)FB(\\d+)(C|U)?x(${ID})y${TEXT}`))) {
    if (m[3] === 'U') fail('E_EXPERIMENTAL', 'Buffers sem verificação são experimentais.', location);
    return node(m[1] === 'DefStk' ? 'bufferDeclare' : 'bufferAppend', { capacity: m[2], name: m[4], text: decodeString(m[5], location) });
  }
  if ((m = match(`Somarl(I8|UT|FB\\d+[CU]?)xyx${TEXT}y${TEXT}`))) {
    if (m[1].endsWith('U') && m[1].startsWith('FB')) fail('E_EXPERIMENTAL', 'Buffers sem verificação são experimentais.', location);
    return node('concat', { mode: m[1], text: decodeString(m[2], location) + decodeString(m[3], location) });
  }
  if (text === 'GerarTxtUltimo') return node('printLast');
  if ((m = match(`GerarTxtx${TEXT}`))) return node('print', { text: decodeString(m[1], location) });
  if ((m = match(`GerarTxtx(${ID})`))) return node('printName', { name: m[1] });
  if ((m = match(`DefStructSOAx(${ID})`))) return node('struct', { name: m[1], properties: [] });
  if ((m = match(`DefRegistrox(${ID})`))) return node('record', { name: m[1], properties: [] });
  if ((m = match(`DefEnumx(${ID})`))) return node('enum', { name: m[1], properties: [] });
  if ((m = match(`Itemx(${ID})`))) return node('enumItem', { name: m[1] });
  if ((m = match(`Prop(${TYPE_PATTERN})x(${ID})`))) return node('property', { name: m[2], type: typeOf(m[1]) });
  if ((m = match(`Prop(In|Fl)(32|64)x(${ID})`))) return node('property', { name: m[3], type: typeOf(`${m[1]}${m[1] === 'In' ? 'Sd' : ''}${m[2]}`) });
  if ((m = match(`PropBlx(${ID})`))) return node('property', { name: m[1], type: typeOf('Bl') });
  if (text === 'FimDef') return node('endStruct');
  if ((m = match(`DefArraySoAx(${ID})x(${ID})x(\\d+)`))) return node('array', { name: m[1], struct: m[2], count: m[3] });
  if ((m = match(`AlocSOAx(${ID})x(${ID})xy?(\\d+)`))) return node('array', { name: m[2], struct: m[1], count: m[3] });
  if ((m = match(`GetVarx(${ID})xIndex(${INDEX})x(${ID})`))) return node('get', { access: `${m[1]}@${m[2]}.${m[3]}` });
  if ((m = match(`ParaCadaSOAx(${ID})xSomar(.+)`))) return node('each', { name: m[1], operation: m[2] });
  if ((m = match('(Somar|Subtr|Multi|Divid)Vec4In(32|64)x\\[([^\\]]+)\\]y\\[([^\\]]+)\\]'))) {
    return node('vector', { op: m[1], type: typeOf(`InSd${m[2]}`), left: m[3].split(',').map(x => x.trim()), right: m[4].split(',').map(x => x.trim()) });
  }
  fail('E_SYNTAX', `Comando inválido ou não suportado: ${text}`, location);
}

function parse(source, file) {
  const statements = readSource(source, file);
  const root = { kind: 'program', body: [] };
  const stack = [root];
  for (const statement of statements) {
    const item = command(statement);
    const parent = stack[stack.length - 1];
    if (item.kind === 'import' && parent !== root) fail('E_IMPORT', 'Importar exige o nível superior.', item.location);
    if (item.kind === 'else') {
      if (parent.kind !== 'if' || parent.inElse) fail('E_SCOPE', 'Senao sem Se correspondente.', item.location);
      parent.inElse = true; continue;
    }
    if (item.kind === 'catch') {
      if (parent.kind !== 'try' || parent.errorName) fail('E_SCOPE', 'Capturar sem Tentar correspondente.', item.location);
      parent.errorName = item.name; continue;
    }
    const closer = { endIf: 'if', endWhile: 'while', endFor: 'for', endTry: 'try', endFunction: 'function' }[item.kind];
    if (closer) {
      if (parent.kind !== closer) fail('E_SCOPE', 'Fechamento de bloco incompatível.', item.location);
      if (closer === 'try' && !parent.errorName) fail('E_SCOPE', 'Tentar exige Capturar.', item.location);
      stack.pop(); continue;
    }
    if (item.kind === 'function' && parent !== root) fail('E_FUNCTION', 'Funções devem ser declaradas no nível superior.', item.location);
    if (['record', 'enum'].includes(item.kind) && parent !== root) fail('E_TYPE', 'Tipos nominais exigem o nível superior.', item.location);
    if (['struct', 'record', 'enum'].includes(parent.kind)) {
      if (item.kind === 'endStruct') { stack.pop(); continue; }
      if (item.kind !== (parent.kind === 'enum' ? 'enumItem' : 'property')) fail('E_STRUCT', 'Membro de tipo inválido; esperado Prop, Item ou FimDef.', item.location);
      if (parent.properties.some(x => x.name === item.name)) fail('E_DUPLICATE', `Propriedade '${item.name}' duplicada.`, item.location);
      parent.properties.push(item);
      continue;
    }
    if (item.kind === 'endScope') {
      if (parent.kind !== 'scope' || parent.name !== item.name) fail('E_SCOPE', `EscopoFimx${item.name} não corresponde ao escopo aberto.`, item.location);
      stack.pop();
    } else if (['property', 'enumItem', 'endStruct'].includes(item.kind)) {
      fail('E_STRUCT', 'Comando fora de DefStructSOA.', item.location);
    } else {
      const body = parent.kind === 'if' && parent.inElse ? parent.otherwise : parent.kind === 'try' && parent.errorName ? parent.handler : parent.body;
      body.push(item);
      if (['scope', 'struct', 'record', 'enum', 'if', 'while', 'for', 'try', 'function'].includes(item.kind)) stack.push(item);
    }
  }
  if (stack.length !== 1) fail('E_UNCLOSED', `Bloco '${stack[stack.length - 1].name}' sem fechamento.`, stack[stack.length - 1].location);
  return root;
}

module.exports = { parse, argumentsOf };
