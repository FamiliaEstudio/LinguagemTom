#include "tom_runtime.h"
static int64_t live_objects, peak_objects;
static int64_t handle_id;
int32_t tom_handle_next(int64_t *out) { if(!out)return TOM_INVALID;if(handle_id==INT64_MAX)return TOM_OVERFLOW;*out=++handle_id;return TOM_OK; }
void tom_object_acquired(void) { live_objects++; if (live_objects > peak_objects) peak_objects = live_objects; }
void tom_object_released(void) { live_objects--; }
int64_t tom_peak_objects(void) { return peak_objects; }
int64_t tom_live_objects(void) { return live_objects; }
const char *tom_error_message(int32_t code) {
  switch (code) {
    case TOM_OVERFLOW: return "Overflow numérico.";
    case TOM_DIVISION: return "Divisão por zero ou operação inválida.";
    case TOM_UNDERFLOW: return "Subfluxo decimal inexato.";
    case TOM_INVALID: return "Entrada inválida ou perda de precisão.";
    case TOM_CAPACITY: return "Capacidade do buffer excedida.";
    case TOM_BOUNDS: return "Índice fora do limite.";
    case TOM_MEMORY: return "Memória insuficiente.";
    case TOM_RESOURCE: return "Falha de recurso (janela, áudio ou arquivo).";
    case TOM_LATE: return "A posição de áudio solicitada já foi processada.";
    default: return "Erro interno do runtime.";
  }
}
int tom_utf8_valid(const char *text) {
  const unsigned char *p = (const unsigned char *)text;
  if (!p) return 0;
  while (*p) {
    uint32_t value; int remaining;
    if (*p < 0x80) { p++; continue; }
    if (*p >= 0xc2 && *p <= 0xdf) { value = *p & 31; remaining = 1; }
    else if (*p >= 0xe0 && *p <= 0xef) { value = *p & 15; remaining = 2; }
    else if (*p >= 0xf0 && *p <= 0xf4) { value = *p & 7; remaining = 3; }
    else return 0;
    const int count = remaining; p++;
    while (remaining--) { if (*p < 0x80 || *p > 0xbf) return 0; value = (value << 6) | (*p++ & 63); }
    if ((count == 1 && value < 0x80) || (count == 2 && value < 0x800) || (count == 3 && value < 0x10000) || (value >= 0xd800 && value <= 0xdfff) || value > 0x10ffff) return 0;
  }
  return 1;
}
