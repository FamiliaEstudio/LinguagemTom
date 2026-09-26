#include "tom_runtime.h"
#include <SDL3/SDL.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#define CHECK(x) do { if(!(x)){fprintf(stderr,"channel assertion at %d\n",__LINE__);return 1;} } while(0)
int main(int argc,char **argv){
  CHECK(argc==2);TomChannel *c=NULL;TomText *small=NULL,*large=NULL;int32_t available=0,closed=0;
  int blocked=!strcmp(argv[1],"blocked"),overflow=!strcmp(argv[1],"overflow");
  CHECK(tom_channel_new(blocked?1048576:1024,overflow?1:8,&c)==0);
  CHECK(tom_text_new(4,"old",&small)==0);CHECK(tom_text_new(1025,"",&large)==0);
  if(!strcmp(argv[1],"wait")){
    int64_t now,after;CHECK(tom_time_now(&now)==0);
    CHECK(tom_channel_until(c,small,now-1,&available)==0&&!available);CHECK(!strcmp(small->data,"old"));
    CHECK(tom_channel_until(c,small,now+30000000,&available)==0&&!available);
    CHECK(tom_time_now(&after)==0&&after-now>=20000000);CHECK(!strcmp(small->data,"old"));
    CHECK(tom_channel_send(c,"waiting")==0);
    CHECK(tom_channel_until(c,small,after+3000000000LL,&available)==TOM_CAPACITY);CHECK(!strcmp(small->data,"old"));
    CHECK(tom_channel_until(c,large,0,&available)==0&&available);CHECK(!strcmp(large->data,"Olá 🐈 %"));
    CHECK(tom_time_now(&now)==0);
    CHECK(tom_channel_until(c,large,now+3000000000LL,&available)==0&&!available);
    CHECK(tom_channel_closed(c,&closed)==0&&closed);CHECK(!strcmp(large->data,"Olá 🐈 %"));
  }else if(blocked){
    char *text=malloc(1048577);CHECK(text);memset(text,'x',1048576);text[1048576]=0;
    int result=0;for(int i=0;i<100&&result==0;i++)result=tom_channel_send(c,text);
    CHECK(result==TOM_CAPACITY);free(text); // Host deliberately never reads stdout.
  }else if(overflow){
    SDL_Delay(250);CHECK(tom_channel_poll(c,large,&available)==0&&available);
    CHECK(!strcmp(large->data,"first"));CHECK(tom_channel_poll(c,large,&available)==TOM_CAPACITY);
  }else{
    int error=0;Uint64 until=SDL_GetTicks()+3000;
    do{error=tom_channel_poll(c,small,&available);if(!error&&!available)SDL_Delay(1);}while(!error&&!available&&SDL_GetTicks()<until);
    CHECK(error==TOM_CAPACITY);CHECK(!strcmp(small->data,"old"));
    CHECK(tom_channel_poll(c,large,&available)==0&&available);CHECK(!strcmp(large->data,"Olá 🐈 %"));
    CHECK(tom_channel_send(c,large->data)==0);
    do{CHECK(tom_channel_closed(c,&closed)==0);if(!closed)SDL_Delay(1);}while(!closed&&SDL_GetTicks()<until);
    CHECK(closed);
  }
  tom_channel_free(c);tom_text_free(small);tom_text_free(large);CHECK(tom_live_objects()==0);return 0;
}
