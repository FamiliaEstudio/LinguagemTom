#ifndef TOM_FILE_IO_H
#define TOM_FILE_IO_H
#include "tom_runtime.h"
#include <stdio.h>
FILE *tom_file_open(const char *path,const char *mode);
int32_t tom_file_read_all(const char *path,uint64_t limit,unsigned char **out,size_t *size);
int32_t tom_file_write_all(const char *path,const void *bytes,size_t size);
int32_t tom_file_copy(const char *source,const char *destination);
int32_t tom_file_hash(const char *path,TomText *out);
int32_t tom_file_mkdir(const char *path);
int32_t tom_file_publish(const char *source,const char *destination,int32_t replace);
char *tom_file_join(const char *root,const char *relative);
int tom_file_relative(const char *path);
#endif
