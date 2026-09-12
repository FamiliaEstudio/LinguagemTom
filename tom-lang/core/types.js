'use strict';
const { fail } = require('./source');

const TYPE_PATTERN = '(?:In(?:Sd|Ud)(?:32|64)|Fl(?:32|64)|Bl|Dc34)';
const NUMBER_PATTERN = '-?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?';

function typeOf(name) {
  if (name === 'Bl') return { name, kind: 'bool', llvm: 'i1', bits: 1 };
  if (name === 'Dc34') return { name, kind: 'decimal', llvm: 'ptr' };
  if (/^FB\d+C$/.test(name)) return { name, kind: 'buffer', llvm: 'ptr', capacity: BigInt(name.slice(2, -1)) };
  if (['Janela', 'Fonte', 'Evento', 'Txt'].includes(name)) return { name, kind: name === 'Txt' ? 'textview' : 'resource', llvm: 'ptr' };
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
