#include "tom_runtime.h"
#include <math.h>
#include <stdlib.h>
int32_t tom_require(int32_t condition) { return condition == 1 ? TOM_OK : TOM_INVALID; }
int32_t tom_raise(int32_t code) { return code > TOM_OK && code <= TOM_LATE ? code : TOM_INVALID; }
int32_t tom_i32_i64(int32_t value,int64_t *out) { if(!out)return TOM_INVALID;*out=value;return TOM_OK; }
int32_t tom_u32_i64(uint32_t value,int64_t *out) { if(!out)return TOM_INVALID;*out=value;return TOM_OK; }
int32_t tom_i64_u32(int64_t value,uint32_t *out) { if(!out)return TOM_INVALID;if(value<0||value>UINT32_MAX)return TOM_OVERFLOW;*out=(uint32_t)value;return TOM_OK; }
int32_t tom_i64_i32(int64_t value,int32_t *out) { if(!out)return TOM_INVALID;if(value<INT32_MIN||value>INT32_MAX)return TOM_OVERFLOW;*out=(int32_t)value;return TOM_OK; }
int32_t tom_i64_u64(int64_t value,uint64_t *out) { if(!out)return TOM_INVALID;if(value<0)return TOM_OVERFLOW;*out=(uint64_t)value;return TOM_OK; }
int32_t tom_u64_i64(uint64_t value,int64_t *out) { if(!out)return TOM_INVALID;if(value>INT64_MAX)return TOM_OVERFLOW;*out=(int64_t)value;return TOM_OK; }
int32_t tom_muldiv_i64(int64_t a,int64_t b,int64_t divisor,int64_t *out) {
  if(!out)return TOM_INVALID;if(!divisor)return TOM_DIVISION;
  __int128 result=(__int128)a*b/divisor;
  if(result<INT64_MIN||result>INT64_MAX)return TOM_OVERFLOW;
  *out=(int64_t)result;return TOM_OK;
}

int32_t tom_i32_f64(int32_t v, double *out) { if (!out) return TOM_INVALID; *out = (double)v; return TOM_OK; }
int32_t tom_i64_f64(int64_t v, double *out) { if (!out) return TOM_INVALID; *out = (double)v; return TOM_OK; }
int32_t tom_f64_i32(double v, int32_t *out) {
  if (!out || !isfinite(v)) return TOM_INVALID;
  double t = trunc(v); if (t < -2147483648.0 || t >= 2147483648.0) return TOM_OVERFLOW;
  *out = (int32_t)t; return TOM_OK;
}
int32_t tom_f64_i64(double v, int64_t *out) {
  if (!out || !isfinite(v)) return TOM_INVALID;
  double t = trunc(v); if (t < -9223372036854775808.0 || t >= 9223372036854775808.0) return TOM_OVERFLOW;
  *out = (int64_t)t; return TOM_OK;
}
int32_t tom_power_f64(double a, double b, double *out) {
  if (!out || !isfinite(a) || !isfinite(b)) return TOM_INVALID;
  double value = pow(a, b); if (isnan(value)) return TOM_INVALID;
  if (!isfinite(value)) return TOM_OVERFLOW;
  *out = value; return TOM_OK;
}

/* PCG XSH RR 64/32. State and stream follow the public reference algorithm.
 * The arithmetic deliberately wraps unsigned integers; no host rand() state. */
struct TomRandom { uint64_t state, increment; };
static uint32_t next(TomRandom *r) {
  uint64_t old = r->state;
  r->state = old * UINT64_C(6364136223846793005) + r->increment;
  uint32_t x = (uint32_t)(((old >> 18u) ^ old) >> 27u), rotation = (uint32_t)(old >> 59u);
  return (x >> rotation) | (x << ((0u - rotation) & 31u));
}
int32_t tom_random_new(uint64_t seed, uint64_t stream, TomRandom **out) {
  if (!out || stream > INT64_MAX) return TOM_INVALID;
  TomRandom *r = calloc(1, sizeof(*r)); if (!r) return TOM_MEMORY;
  r->increment = (stream << 1u) | 1u; next(r); r->state += seed; next(r);
  tom_object_acquired(); tom_random_free(*out); *out = r; return TOM_OK;
}
void tom_random_free(TomRandom *r) { if (r) { free(r); tom_object_released(); } }
int32_t tom_random_bounded(TomRandom *r, uint32_t bound, uint32_t *out) {
  if (!r || !out || !bound) return TOM_INVALID;
  uint32_t threshold = (0u - bound) % bound, value;
  do { value = next(r); } while (value < threshold);
  *out = value % bound; return TOM_OK;
}
