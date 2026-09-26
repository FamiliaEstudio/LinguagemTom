#include "document.h"
#include "file_io.h"
#define SDL_MAIN_HANDLED
#include <SDL3/SDL.h>
#include <assert.h>
#include <stdio.h>
#include <stdlib.h>
int main(int argc,char **argv){
 assert(argc>=2);unsigned char *request=NULL;size_t size=0;
 assert(!tom_file_read_all(argv[1],268435456,&request,&size));
 TomFileJob *job=NULL;assert(!tom_file_job_new((char*)request,&job));free(request);
 if(argc==3)assert(!tom_file_job_cancel(job));
 int32_t state=0,error=0;uint64_t end=SDL_GetTicks()+30000;
 while(!state){assert(!tom_file_job_field(job,0,&state));assert(SDL_GetTicks()<end);SDL_Delay(1);}
 TomText *result=NULL;assert(!tom_text_dynamic_new("",268435456,&result));
 assert(!tom_file_job_field(job,2,&error));
 assert(!tom_file_job_result(job,result));printf("%d %d\n%s\n",state,error,result->data);
 assert(!tom_file_job_message(job,result));fprintf(stderr,"%s\n",result->data);
 tom_text_free(result);tom_file_job_free(job);assert(!tom_live_objects());return 0;
}
