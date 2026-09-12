#ifndef TOM_RUNTIME_H
#define TOM_RUNTIME_H
#include <stdint.h>
#include <stddef.h>
#ifdef __cplusplus
extern "C" {
#endif
enum { TOM_OK, TOM_OVERFLOW, TOM_DIVISION, TOM_UNDERFLOW, TOM_INVALID, TOM_CAPACITY, TOM_BOUNDS, TOM_MEMORY, TOM_RESOURCE };
typedef struct mpd_t TomDecimal;
typedef struct TomWindow TomWindow;
typedef struct TomFont TomFont;
typedef struct TomEvent TomEvent;
typedef struct TomText { uint64_t capacity, length; char *data; } TomText;
const char *tom_error_message(int32_t code);
int tom_utf8_valid(const char *text);
void tom_object_acquired(void);
void tom_object_released(void);
int64_t tom_live_objects(void);
int32_t tom_text_new(uint64_t capacity, const char *value, TomText **out);
void tom_text_free(TomText *text);
const char *tom_text_data(const TomText *text);
int32_t tom_text_set(TomText *text, const char *value);
int32_t tom_text_append(TomText *text, const char *value);
int32_t tom_text_clear(TomText *text);
int32_t tom_text_pop(TomText *text);
int32_t tom_text_length(const TomText *text, uint64_t *out);
int32_t tom_text_replace_ascii(TomText *text, int32_t from, int32_t to);
int32_t tom_text_codepoint(const char *text, uint64_t index, int32_t *out);
int32_t tom_integer_format(int32_t value, TomText *out);
int64_t tom_peak_objects(void);
int32_t tom_text_characters(const char *text, uint64_t *out);
int32_t tom_text_slice(TomText *out, const char *text, uint64_t start, uint64_t count);
int32_t tom_decimal_parse(const char *text, TomDecimal **out);
int32_t tom_decimal_copy(const TomDecimal *value, TomDecimal **out);
int32_t tom_decimal_math(int32_t op, const TomDecimal *a, const TomDecimal *b, TomDecimal **out);
int32_t tom_decimal_compare(const TomDecimal *a, const TomDecimal *b, int32_t *out);
int32_t tom_decimal_format(const TomDecimal *value, TomText *out);
void tom_decimal_free(TomDecimal *value);
int32_t tom_window_new(const char *title, int32_t width, int32_t height, TomWindow **out);
int32_t tom_font_new(int32_t size, TomFont **out);
int32_t tom_event_new(TomEvent **out);
void tom_window_free(TomWindow *value);
void tom_font_free(TomFont *value);
void tom_event_free(TomEvent *value);
int32_t tom_event_wait(TomWindow *window, TomEvent *out);
int32_t tom_event_poll(TomWindow *window, TomEvent *out, int32_t *available);
int32_t tom_event_field(const TomEvent *event, int32_t field, int32_t *out);
int32_t tom_event_text(const TomEvent *event, TomText *out);
int32_t tom_window_clear(TomWindow *window, uint32_t rgba);
int32_t tom_draw_rect(TomWindow *window, int32_t x, int32_t y, int32_t width, int32_t height, uint32_t rgba);
int32_t tom_draw_text(TomWindow *window, TomFont *font, const char *text, int32_t x, int32_t y, uint32_t rgba);
int32_t tom_measure_text(TomFont *font, const char *text, int32_t *out);
int32_t tom_window_present(TomWindow *window);
#ifdef __cplusplus
}
#endif
#endif
