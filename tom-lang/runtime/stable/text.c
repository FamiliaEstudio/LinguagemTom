#include "tom_runtime.h"
#include <stdlib.h>
#include <string.h>
#include <stdio.h>
#include <inttypes.h>
#ifdef TOM_TEXT_TEST
static int64_t allocation_countdown = -1;
void tom_text_test_fail_after(int64_t count) { allocation_countdown = count; }
static int allocation_fails(void) {
  if (allocation_countdown < 0) return 0;
  if (!allocation_countdown) { allocation_countdown = -1; return 1; }
  allocation_countdown--; return 0;
}
#else
static int allocation_fails(void) { return 0; }
#endif
static void *text_alloc(size_t size) { return allocation_fails() ? NULL : malloc(size); }
static void *text_resize(void *value, size_t size) { return allocation_fails() ? NULL : realloc(value,size); }

int32_t tom_text_new(uint64_t capacity, const char *value, TomText **out) {
  if (!out || !capacity || capacity > INT32_MAX || !tom_utf8_valid(value)) return TOM_INVALID;
  size_t length = strlen(value);
  if (length >= capacity) return TOM_CAPACITY;
  TomText *text = text_alloc(sizeof(*text));
  if (!text) return TOM_MEMORY;
  memset(text,0,sizeof(*text));
  text->data = text_alloc((size_t)capacity);
  if (!text->data) { free(text); return TOM_MEMORY; }
  text->capacity = capacity; text->length = length; memcpy(text->data, value, length + 1);
  tom_object_acquired(); tom_text_free(*out); *out = text; return TOM_OK;
}
int32_t tom_text_dynamic_new(const char *value, uint64_t limit, TomText **out) {
  if (!out || !limit || limit > INT32_MAX || !tom_utf8_valid(value)) return TOM_INVALID;
  size_t length = strlen(value);
  if (length >= limit) return TOM_CAPACITY;
  uint64_t capacity = limit < 64 ? limit : 64;
  while (capacity <= length) capacity = capacity > limit/2 ? limit : capacity*2;
  /* Build separately: value is allowed to refer to the previous resource. */
  TomText *fresh = NULL;
  int32_t error = tom_text_new(capacity,value,&fresh);
  if (error) return error;
  fresh->limit=limit; tom_text_free(*out); *out=fresh; return TOM_OK;
}
void tom_text_free(TomText *text) { if (text) { free(text->data); free(text); tom_object_released(); } }
const char *tom_text_data(const TomText *text) { return text ? text->data : ""; }
const char *tom_text_view_data(const TomTextView *view) { return view->text ? tom_text_data(view->text) : view->literal; }

/* All validation and allocations precede the first content change. */
static int32_t replace_bytes(TomText *text, size_t begin, size_t end, const char *value, size_t length) {
  uint64_t limit=text->limit ? text->limit : text->capacity;
  uint64_t kept=text->length-(end-begin);
  if (length >= limit || kept >= limit-length) return TOM_CAPACITY;
  size_t total=(size_t)kept+length, capacity=(size_t)text->capacity;
  char *copy=NULL;
  uintptr_t address=(uintptr_t)value, base=(uintptr_t)text->data;
  if (length && address>=base && address-base<=text->length) {
    copy=text_alloc(length); if (!copy) return TOM_MEMORY;
    memcpy(copy,value,length); value=copy;
  }
  if (total>=capacity) {
    while (capacity<=total) capacity=capacity>limit/2 ? (size_t)limit : capacity*2;
    char *next=text_resize(text->data,capacity);
    if (!next) { free(copy); return TOM_MEMORY; }
    text->data=next; text->capacity=capacity;
  }
  memmove(text->data+begin+length,text->data+end,(size_t)text->length-end+1);
  if (length) memcpy(text->data+begin,value,length);
  text->length=total; free(copy); return TOM_OK;
}
int32_t tom_text_set(TomText *text, const char *value) {
  if (!text || !tom_utf8_valid(value)) return TOM_INVALID;
  if (text->data==value) return TOM_OK;
  return replace_bytes(text,0,(size_t)text->length,value,strlen(value));
}
int32_t tom_text_append(TomText *text, const char *value) {
  if (!text || !tom_utf8_valid(value)) return TOM_INVALID;
  return replace_bytes(text,(size_t)text->length,(size_t)text->length,value,strlen(value));
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
  return replace_bytes(out,0,(size_t)out->length,(const char *)begin,length);
}

static const char *advance(const char *text, uint64_t count) {
  while (count && *text) { text++; while (((unsigned char)*text & 0xc0)==0x80) text++; count--; }
  return count ? NULL : text;
}
int32_t tom_text_substitute(TomText *text,uint64_t start,uint64_t count,const char *value) {
  if (!text || !tom_utf8_valid(value)) return TOM_INVALID;
  const char *begin=advance(text->data,start), *end=begin ? advance(begin,count) : NULL;
  if (!end) return TOM_BOUNDS;
  return replace_bytes(text,(size_t)(begin-text->data),(size_t)(end-text->data),value,strlen(value));
}
int32_t tom_text_insert(TomText *text,uint64_t start,const char *value) { return tom_text_substitute(text,start,0,value); }
int32_t tom_text_remove(TomText *text,uint64_t start,uint64_t count) { return tom_text_substitute(text,start,count,""); }
int32_t tom_text_find(const char *text,const char *needle,uint64_t start,int64_t *out) {
  if (!out || !tom_utf8_valid(text) || !tom_utf8_valid(needle)) return TOM_INVALID;
  const char *begin=advance(text,start);
  if (!begin) return TOM_BOUNDS;
  const char *found=strstr(begin,needle);
  if (!found) { *out=-1; return TOM_OK; }
  uint64_t index=start;
  for (const char *p=begin;p<found;p++) if (((unsigned char)*p & 0xc0)!=0x80) index++;
  if (index>INT64_MAX) return TOM_OVERFLOW;
  *out=(int64_t)index; return TOM_OK;
}
