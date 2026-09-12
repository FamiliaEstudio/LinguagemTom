#include "tom_runtime.h"
#include <mpdecimal.h>
#include <stdlib.h>
#include <string.h>
static mpd_context_t context(void) { mpd_context_t c; mpd_ieee_context(&c, MPD_DECIMAL128); return c; }
static int32_t status_error(uint32_t status) {
  if (status & MPD_Malloc_error) return TOM_MEMORY;
  if (status & MPD_Division_by_zero) return TOM_DIVISION;
  if (status & MPD_Overflow) return TOM_OVERFLOW;
  if (status & MPD_Underflow) return TOM_UNDERFLOW;
  if (status & MPD_IEEE_Invalid_operation) return TOM_INVALID;
  return TOM_OK;
}
void tom_decimal_free(TomDecimal *value) { if (value) { mpd_del(value); tom_object_released(); } }
static int32_t publish(TomDecimal *value, uint32_t status, TomDecimal **out) {
  int32_t error = status_error(status);
  if (!error && !mpd_isfinite(value)) error = TOM_INVALID;
  if (error) { mpd_del(value); return error; }
  tom_object_acquired(); tom_decimal_free(*out); *out = value; return TOM_OK;
}
static int valid_decimal(const char *p) {
  if (!p) return 0;
  if (*p == '+' || *p == '-') p++;
  if (*p < '0' || *p > '9') return 0;
  while (*p >= '0' && *p <= '9') p++;
  if (*p == '.') { p++; if (*p < '0' || *p > '9') return 0; while (*p >= '0' && *p <= '9') p++; }
  if (*p == 'e' || *p == 'E') { p++; if (*p == '+' || *p == '-') p++; if (*p < '0' || *p > '9') return 0; while (*p >= '0' && *p <= '9') p++; }
  return !*p;
}
int32_t tom_decimal_parse(const char *text, TomDecimal **out) {
  if (!out || !valid_decimal(text)) return TOM_INVALID;
  mpd_context_t ctx = context(); uint32_t status = 0;
  TomDecimal *result = mpd_qnew(); if (!result) return TOM_MEMORY;
  mpd_qset_string(result, text, &ctx, &status);
  if ((status & MPD_Inexact) && !status_error(status)) { mpd_del(result); return TOM_INVALID; }
  return publish(result, status, out);
}
int32_t tom_decimal_copy(const TomDecimal *value, TomDecimal **out) {
  if (!value || !out) return TOM_INVALID;
  uint32_t status = 0; TomDecimal *result = mpd_qnew(); if (!result) return TOM_MEMORY;
  mpd_qcopy(result, value, &status); return publish(result, status, out);
}
int32_t tom_decimal_math(int32_t op, const TomDecimal *a, const TomDecimal *b, TomDecimal **out) {
  if (!a || !b || !out || op < 0 || op > 3) return TOM_INVALID;
  if (op == 3 && mpd_iszero(b)) return TOM_DIVISION;
  mpd_context_t ctx = context(); uint32_t status = 0;
  TomDecimal *result = mpd_qnew(); if (!result) return TOM_MEMORY;
  switch (op) {
    case 0: mpd_qadd(result, a, b, &ctx, &status); break;
    case 1: mpd_qsub(result, a, b, &ctx, &status); break;
    case 2: mpd_qmul(result, a, b, &ctx, &status); break;
    case 3: mpd_qdiv(result, a, b, &ctx, &status); break;
  }
  return publish(result, status, out);
}
int32_t tom_decimal_compare(const TomDecimal *a, const TomDecimal *b, int32_t *out) {
  if (!a || !b || !out) return TOM_INVALID;
  uint32_t status = 0; int result = mpd_qcmp(a, b, &status);
  int32_t error = status_error(status); if (!error) *out = result; return error;
}
int32_t tom_decimal_format(const TomDecimal *value, TomText *out) {
  if (!value || !out) return TOM_INVALID;
  if (mpd_iszero(value)) return tom_text_set(out, "0");
  mpd_context_t ctx = context(); uint32_t status = 0;
  TomDecimal *reduced = mpd_qnew(); if (!reduced) return TOM_MEMORY;
  mpd_qreduce(reduced, value, &ctx, &status);
  int32_t error = status_error(status); if (error) { mpd_del(reduced); return error; }
  // Select notation without further rounding; retain every significant digit.
  mpd_ssize_t adjusted = reduced->exp + reduced->digits - 1;
  const char *format = adjusted >= -6 && adjusted <= 33 ? "f" : "E";
  char *text = mpd_qformat(reduced, format, &ctx, &status);
  error = status_error(status);
  if (!text) error = TOM_MEMORY;
  if (!error) error = tom_text_set(out, text);
  if (text) mpd_free(text); mpd_del(reduced); return error;
}
