#ifndef TOM_XLSX_H
#define TOM_XLSX_H
#include "tom_runtime.h"
#include <yyjson.h>
/* Internal worker interface. No spreadsheet/application rules in this reader. */
typedef int32_t (*TomXlsxProgress)(void *context, int percent);
int32_t tom_xlsx_read(const char *path, const char *sheet, yyjson_mut_doc *result,
                     TomXlsxProgress progress, void *context, char *message, size_t capacity);
#endif
