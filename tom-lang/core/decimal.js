'use strict';
const { fail } = require('./source');
const PRECISION = 34;
const EMIN = -6143;
const EMAX = 6144;
const ETINY = -6176;
const abs = n => n < 0n ? -n : n;
const digits = n => abs(n).toString().length;
const pow10 = n => 10n ** BigInt(n);

function normalize(c, e) {
  if (c === 0n) return { c: 0n, e: 0 };
  while (c % 10n === 0n) { c /= 10n; e++; }
  return { c, e };
}
function check(value, loc) {
  const { c, e } = value;
  if (c && e + digits(c) - 1 > EMAX) fail('E_OVERFLOW', 'Overflow em Dc34.', loc);
  if (c && e < ETINY) fail('E_UNDERFLOW', 'Subfluxo em Dc34.', loc);
  return value;
}
function parseDecimal(raw, loc) {
  const m = /^(-?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(raw);
  if (!m) fail('E_LITERAL', `Literal Dc34 inválido: '${raw}'.`, loc);
  let c = BigInt((m[1] || '') + m[2] + (m[3] || ''));
  if (!c) return { c: 0n, e: 0 };
  let e = BigInt(m[4] || '0') - BigInt((m[3] || '').length);
  while (c % 10n === 0n) { c /= 10n; e++; }
  if (digits(c) > PRECISION) fail('E_PRECISION', 'Literal Dc34 excede 34 dígitos significativos.', loc);
  if (e > BigInt(EMAX)) fail('E_OVERFLOW', 'Literal Dc34 fora da faixa.', loc);
  if (e < BigInt(ETINY)) fail('E_UNDERFLOW', 'Literal Dc34 fora da faixa.', loc);
  return check({ c, e: Number(e) }, loc); // Only the bounded exponent is a JS number.
}
function quotient(n, d) {
  const q = n / d, r = n % d;
  return { value: q + (r * 2n > d || (r * 2n === d && q % 2n) ? 1n : 0n), inexact: r !== 0n };
}
function rounded(c, e, loc) {
  if (!c) return normalize(c, e);
  const adjusted = e + digits(c) - 1;
  const shift = Math.max(digits(c) - PRECISION, ETINY - e, 0);
  if (shift) {
    const result = quotient(abs(c), pow10(shift));
    if (result.inexact && adjusted < EMIN) fail('E_UNDERFLOW', 'Subfluxo inexato em Dc34.', loc);
    c = (c < 0n ? -1n : 1n) * result.value;
    e += shift;
  }
  return check(normalize(c, e), loc);
}
function calculate(op, a, b, loc) {
  if (op === 'Somar' || op === 'Subtr') {
    const e = Math.min(a.e, b.e);
    return rounded(a.c * pow10(a.e - e) + (op === 'Somar' ? b.c : -b.c) * pow10(b.e - e), e, loc);
  }
  if (op === 'Multi') return rounded(a.c * b.c, a.e + b.e, loc);
  if (!b.c) fail('E_DIVISION', 'Divisão decimal por zero.', loc);
  if (!a.c) return normalize(0n, 0);
  const n = abs(a.c), d = abs(b.c);
  let order = digits(n) - digits(d);
  if (order >= 0 ? n < d * pow10(order) : n * pow10(-order) < d) order--;
  const adjusted = order + a.e - b.e;
  const e = Math.max(adjusted - PRECISION + 1, ETINY);
  const shift = a.e - b.e - e;
  const result = shift >= 0 ? quotient(n * pow10(shift), d) : quotient(n, d * pow10(-shift));
  if (result.inexact && adjusted < EMIN) fail('E_UNDERFLOW', 'Subfluxo inexato em Dc34.', loc);
  return check(normalize((a.c < 0n !== b.c < 0n ? -1n : 1n) * result.value, e), loc);
}
const canonical = value => `${value.c}E${value.e}`;
module.exports = { parseDecimal, calculate, canonical, normalize };
