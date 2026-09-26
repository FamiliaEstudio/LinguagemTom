#include "tom_runtime.h"
#define SDL_MAIN_HANDLED
#include <SDL3/SDL.h>
#include <yyjson.h>
#include <stdatomic.h>
#include <stdlib.h>
#include <string.h>
struct TomFileDialog{_Atomic int references,state;char *result,*location;};
static void release(TomFileDialog *d){if(atomic_fetch_sub(&d->references,1)==1){free(d->result);free(d->location);free(d);}}
static void selected(void *data,const char *const *files,int filter){(void)filter;TomFileDialog *d=data;int state=files?files[0]?1:3:2;yyjson_mut_doc *doc=yyjson_mut_doc_new(NULL);yyjson_mut_val *array=doc?yyjson_mut_arr(doc):NULL;if(!array)state=2;else{yyjson_mut_doc_set_root(doc,array);if(files)for(size_t i=0;files[i];i++)if(!yyjson_mut_arr_add_strcpy(doc,array,files[i]))state=2;d->result=yyjson_mut_write(doc,0,NULL);if(!d->result)state=2;}yyjson_mut_doc_free(doc);atomic_store(&d->state,state);release(d);}
void tom_file_dialog_free(TomFileDialog *d){if(d){release(d);tom_object_released();}}
int32_t tom_file_dialog_new(int32_t mode,const char *location,int32_t many,TomFileDialog **out){if(!out||mode<0||mode>2||!SDL_IsMainThread()||!tom_utf8_valid(location))return TOM_INVALID;
 TomFileDialog *d=calloc(1,sizeof(*d));if(!d)return TOM_MEMORY;d->location=malloc(strlen(location)+1);if(!d->location){free(d);return TOM_MEMORY;}strcpy(d->location,location);atomic_store(&d->references,2);tom_object_acquired();
 if(mode==0)SDL_ShowOpenFileDialog(selected,d,NULL,NULL,0,*location?d->location:NULL,many!=0);else if(mode==1)SDL_ShowSaveFileDialog(selected,d,NULL,NULL,0,*location?d->location:NULL);else SDL_ShowOpenFolderDialog(selected,d,NULL,*location?d->location:NULL,many!=0);
 tom_file_dialog_free(*out);*out=d;return TOM_OK;}
int32_t tom_file_dialog_state(TomFileDialog *d,int32_t *out){if(!d||!out)return TOM_INVALID;*out=atomic_load(&d->state);return TOM_OK;}
int32_t tom_file_dialog_result(TomFileDialog *d,TomText *out){if(!d||!atomic_load(&d->state))return TOM_INVALID;return tom_text_set(out,d->result?d->result:"[]");}
