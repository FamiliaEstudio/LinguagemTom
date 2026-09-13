'use strict';
const { fail } = require('./source');
const { resources } = require('./resources');

const TYPE_PATTERN = '(?:In(?:Sd|Ud)(?:32|64)|Fl(?:32|64)|Bl|Dc34|(?:Enum|Registro)<[A-Za-z_][A-Za-z0-9_]*>)';
const NUMBER_PATTERN = '-?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?';

function typeOf(name) {
  const nominal = /^(Enum|Registro)<([A-Za-z_][A-Za-z0-9_]*)>$/.exec(name);
  if (nominal) return nominal[1] === 'Enum'
    ? { name, kind: 'enum', llvm: 'i32', bits: 32, nominal: nominal[2] }
    : { name, kind: 'record', llvm: 'ptr', storage: `%TomRecord_${nominal[2]}`, nominal: nominal[2] };
  if (name === 'Bl') return { name, kind: 'bool', llvm: 'i1', bits: 1 };
  if (name === 'Dc34') return { name, kind: 'decimal', llvm: 'ptr' };
  if (/^FB\d+C$/.test(name)) return { name, kind: 'buffer', llvm: 'ptr', capacity: BigInt(name.slice(2, -1)) };
  if (resources[name] || name === 'Txt') return { name, kind: name === 'Txt' ? 'textview' : 'resource', llvm: 'ptr' };
  if (/^SOA<[A-Za-z_][A-Za-z0-9_]*>$/.test(name)) return { name, kind: 'soa', struct: name.slice(4, -1), llvm: 'ptr' };
  const integer = /^In(Sd|Ud)(32|64)$/.exec(name);
  if (integer) {
    const bits = Number(integer[2]);
    const signed = integer[1] === 'Sd';
    return { name, kind: 'int', bits, signed, llvm: `i${bits}`,
      min: signed ? -(1n << BigInt(bits - 1)) : 0n,
      max: (1n << BigInt(signed ? bits - 1 : bits)) - 1n };
  }
  if (/^Fl(?:32|64)$/.test(name)) {
    const bits = Number(name.slice(2));
    return { name, kind: 'float', bits, llvm: bits === 32 ? 'float' : 'double' };
  }
  throw new Error(`Tipo interno desconhecido: ${name}`);
}

function literal(raw, type, location) {
  if (['enum', 'record'].includes(type.kind)) fail('E_LITERAL', `${type.name} exige um valor do mesmo tipo.`, location);
  if (type.kind === 'bool') {
    if (!['0', '1', 'Verdadeiro', 'Falso'].includes(raw)) fail('E_LITERAL', 'Bl exige 0, 1, Verdadeiro ou Falso.', location);
    return { type, value: ['1', 'Verdadeiro'].includes(raw) ? 'true' : 'false', constant: ['1', 'Verdadeiro'].includes(raw) };
  }
  if (type.kind === 'decimal') {
    const decimal = require('./decimal');
    const constant = decimal.parseDecimal(raw, location);
    return { type, value: decimal.canonical(constant), constant };
  }
  if (type.kind === 'int') {
    if (!/^-?\d+$/.test(raw)) fail('E_LITERAL', `Literal inteiro inválido: '${raw}'.`, location);
    const value = BigInt(raw);
    if ((!type.signed && raw.startsWith('-')) || value < type.min || value > type.max) {
      fail('E_RANGE', `'${raw}' fora da faixa de ${type.name} (${type.min} a ${type.max}).`, location);
    }
    return { type, value: value.toString(), constant: value };
  }
  if (!new RegExp(`^${NUMBER_PATTERN}$`).test(raw)) fail('E_LITERAL', `Literal real inválido: '${raw}'.`, location);
  const parsed = Number(raw);
  const value = type.bits === 32 ? Math.fround(parsed) : parsed;
  if (!Number.isFinite(value)) fail('E_RANGE', `'${raw}' fora da faixa finita de ${type.name}.`, location);
  // LLVM float hexadecimal syntax uses the exact double encoding of the f32 value.
  const bytes = new DataView(new ArrayBuffer(8));
  bytes.setFloat64(0, value, false);
  const hex = bytes.getBigUint64(0, false).toString(16).padStart(16, '0').toUpperCase();
  return { type, value: `0x${hex}`, constant: value };
}

function sameType(actual, expected, location) {
  if (actual.name !== expected.name) {
    fail('E_TYPE', `Tipo incompatível: esperado ${expected.name}, encontrado ${actual.name}.`, location);
  }
}

module.exports = { TYPE_PATTERN, NUMBER_PATTERN, typeOf, literal, sameType };
