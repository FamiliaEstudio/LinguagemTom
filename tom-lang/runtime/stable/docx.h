#ifndef TOM_DOCX_H
#define TOM_DOCX_H
#include "document.h"
int32_t tom_docx_read(const char *path,TomDocument *out,TomText *warnings);
int32_t tom_docx_write(const char *path,TomDocument *doc);
#endif
