#include "tom_runtime.h"
#include <stdlib.h>
#include <string.h>
#include <stdio.h>
#include <inttypes.h>
int32_t tom_text_new(uint64_t capacity, const char *value, TomText **out) {
  if (!out || !capacity || capacity > INT32_MAX || !tom_utf8_valid(value)) return TOM_INVALID;
  size_t length = strlen(value);
  if (length >= capacity) return TOM_CAPACITY;
  TomText *text = calloc(1, sizeof(*text));
  if (!text) return TOM_MEMORY;
  text->data = malloc((size_t)capacity);
  if (!text->data) { free(text); return TOM_MEMORY; }
  text->capacity = capacity; text->length = length; memcpy(text->data, value, length + 1);
  tom_object_acquired(); tom_text_free(*out); *out = text; return TOM_OK;
}
void tom_text_free(TomText *text) { if (text) { free(text->data); free(text); tom_object_released(); } }
const char *tom_text_data(const TomText *text) { return text ? text->data : ""; }
int32_t tom_text_set(TomText *text, const char *value) {
  if (!text || !tom_utf8_valid(value)) return TOM_INVALID;
  size_t length = strlen(value);
  if (length >= text->capacity) return TOM_CAPACITY;
  memmove(text->data, value, length + 1); text->length = length; return TOM_OK;
}
int32_t tom_text_append(TomText *text, const char *value) {
  if (!text || !tom_utf8_valid(value)) return TOM_INVALID;
  size_t length = strlen(value);
  if (length >= text->capacity - text->length) return TOM_CAPACITY;
  memmove(text->data + text->length, value, length + 1); text->length += length; return TOM_OK;
}
int32_t tom_text_clear(TomText *text) { return tom_text_set(text, ""); }
int32_t tom_text_pop(TomText *text) {
  if (!text) return TOM_INVALID;
  if (text->length) { do { text->length--; } while (text->length && ((unsigned char)text->data[text->length] & 0xc0) == 0x80); text->data[text->length] = 0; }
  return TOM_OK;
}
int32_t tom_text_length(const TomText *text, uint64_t *out) { if (!text || !out) return TOM_INVALID; *out = text->length; return TOM_OK; }
int32_t tom_text_replace_ascii(TomText *text, int32_t from, int32_t to) {
  if (!text || from < 1 || from > 127 || to < 1 || to > 127) return TOM_INVALID;
  for (uint64_t i = 0; i < text->length; i++) if ((unsigned char)text->data[i] == from) text->data[i] = (char)to;
  return TOM_OK;
}
int32_t tom_text_codepoint(const char *text, uint64_t index, int32_t *out) {
  if (!out || !tom_utf8_valid(text)) return TOM_INVALID;
  const unsigned char *p = (const unsigned char *)text;
  while (*p) {
    uint32_t c = *p++; int count = c < 128 ? 0 : c < 224 ? 1 : c < 240 ? 2 : 3;
    c &= count == 0 ? 127 : count == 1 ? 31 : count == 2 ? 15 : 7;
    while (count--) c = (c << 6) | (*p++ & 63);
    if (!index--) { *out = (int32_t)c; return TOM_OK; }
  }
  return TOM_BOUNDS;
}
int32_t tom_integer_format(int32_t value, TomText *out) { char text[16]; snprintf(text, sizeof(text), "%" PRId32, value); return tom_text_set(out, text); }
int32_t tom_i64_format(int64_t value,TomText *out) { char text[32];snprintf(text,sizeof(text),"%"PRId64,value);return tom_text_set(out,text); }
int32_t tom_u64_format(uint64_t value,TomText *out) { char text[32];snprintf(text,sizeof(text),"%"PRIu64,value);return tom_text_set(out,text); }
int32_t tom_text_equal(const char *a,const char *b,int32_t *out) { if(!out||!tom_utf8_valid(a)||!tom_utf8_valid(b))return TOM_INVALID;*out=!strcmp(a,b);return TOM_OK; }

int32_t tom_text_characters(const char *text, uint64_t *out) {
  if (!out || !tom_utf8_valid(text)) return TOM_INVALID;
  uint64_t count = 0;
  for (const unsigned char *p = (const unsigned char *)text; *p; p++) if ((*p & 0xc0) != 0x80) count++;
  *out = count; return TOM_OK;
}
int32_t tom_text_slice(TomText *out, const char *text, uint64_t start, uint64_t count) {
  if (!out || !tom_utf8_valid(text)) return TOM_INVALID;
  const unsigned char *p = (const unsigned char *)text, *begin;
  while (start && *p) { p++; while ((*p & 0xc0) == 0x80) p++; start--; }
  if (start) return TOM_BOUNDS;
  begin = p;
  while (count && *p) { p++; while ((*p & 0xc0) == 0x80) p++; count--; }
  if (count) return TOM_BOUNDS;
  size_t length = (size_t)(p - begin);
  if (length >= out->capacity) return TOM_CAPACITY;
  memmove(out->data, begin, length); out->data[length] = 0; out->length = length;
  return TOM_OK;
}
