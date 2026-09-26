#ifndef TOM_DOCUMENT_H
#define TOM_DOCUMENT_H
#include "tom_runtime.h"
/* Private shared model for the renderer. All positions are codepoint offsets. */
typedef struct { uint32_t pos, value; } TomDocRun;
typedef struct {
  TomText *text;
  uint32_t *offsets;
  unsigned char *boundaries;
  uint32_t count;
  TomDocRun *runs, *paragraphs;
  size_t run_count, paragraph_count;
  uint64_t anchor, cursor, id;
  uint32_t typing_style;
} TomDocState;
typedef struct TomDocChange TomDocChange;
struct TomDocument {
  TomDocState state;
  uint64_t references, history_limit, history_bytes, next_id, saved_id, generation;
  TomDocChange *first, *last, *current;
  uint64_t next_group;
  int64_t typing_time;
  int grouping, attached;
  uint32_t damage_start, damage_old_end, damage_new_end;
};
void tom_document_retain(TomDocument *doc);
uint32_t tom_document_style_at(const TomDocument *doc,uint64_t position);
uint32_t tom_document_alignment_at(const TomDocument *doc,uint64_t position);
uint64_t tom_document_previous(const TomDocument *doc,uint64_t position);
uint64_t tom_document_next(const TomDocument *doc,uint64_t position);
void tom_document_word_bounds(const TomDocument *doc,uint64_t position,uint64_t *begin,uint64_t *end);
uint64_t tom_document_word(const TomDocument *doc,uint64_t position,int direction);
int32_t tom_document_selection_text(TomDocument *doc,TomText *out);
#ifdef TOM_DOCUMENT_TEST
void tom_document_test_fail_after(int64_t count);
#endif
#endif
