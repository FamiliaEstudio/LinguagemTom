#ifndef TOM_CATALOG_H
#define TOM_CATALOG_H
#include "tom_runtime.h"
#include <stdlib.h>
typedef struct { void *value; int64_t id; } TomCatalogEntry;
typedef struct { TomCatalogEntry *entries; int32_t capacity; } TomCatalog;
static inline int32_t tom_catalog_init(TomCatalog *catalog,int32_t capacity) {
  if(capacity<1 || capacity>1048576)return TOM_CAPACITY;
  catalog->entries=calloc((size_t)capacity,sizeof(*catalog->entries));
  if(!catalog->entries)return TOM_MEMORY;catalog->capacity=capacity;return TOM_OK;
}
static inline TomCatalogEntry *tom_catalog_find(TomCatalog *catalog,int64_t id) {
  if(id<=0)return NULL;
  for(int32_t i=0;i<catalog->capacity;i++)if(catalog->entries[i].value && catalog->entries[i].id==id)return &catalog->entries[i];
  return NULL;
}
static inline TomCatalogEntry *tom_catalog_empty(TomCatalog *catalog) {
  for(int32_t i=0;i<catalog->capacity;i++)if(!catalog->entries[i].value)return &catalog->entries[i];return NULL;
}
#endif
