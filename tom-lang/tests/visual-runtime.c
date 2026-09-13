#include "tom_runtime.h"
#include <SDL3/SDL.h>
#include <assert.h>
#include <math.h>
#include <stdio.h>
#include <string.h>
#define OK(x) assert((x)==TOM_OK)
static SDL_Surface *capture(SDL_Renderer *r) { SDL_Surface *s=SDL_RenderReadPixels(r,NULL);assert(s);return s; }
static void pixel(SDL_Surface *s,int x,int y,int *r,int *g,int *b) {Uint8 rr,gg,bb,aa;assert(SDL_ReadSurfacePixel(s,x,y,&rr,&gg,&bb,&aa));*r=rr;*g=gg;*b=bb;}
int main(void) {
 TomWindow *w=NULL,*other=NULL;TomFont *font=NULL;TomVisual *v=NULL;TomVisualCatalog *catalog=NULL;int64_t id;int32_t width;
 OK(tom_window_new("Visual tests",320,240,&w));int count;SDL_Window **windows=SDL_GetWindows(&count);assert(count==1);SDL_Window *native=windows[0];SDL_free(windows);SDL_Renderer *renderer=SDL_GetRenderer(native);assert(renderer);
 OK(tom_font_new(28,&font));OK(tom_visual_text(w,font,"Tom %",&v));OK(tom_visual_metric(v,0,&width));
 OK(tom_window_clear(w,0xffffffff));OK(tom_draw_visual(w,v,70,100,0x26483bff));SDL_Surface *original=capture(renderer);
 OK(tom_window_clear(w,0xffffffff));OK(tom_draw_visual_transform(w,v,70,100,1,1,0,0x26483bff));SDL_Surface *identity=capture(renderer);
 assert(original->w==identity->w && original->h==identity->h && original->pitch==identity->pitch);
 assert(!memcmp(original->pixels,identity->pixels,(size_t)original->pitch*original->h));SDL_DestroySurface(original);SDL_DestroySurface(identity);
 OK(tom_window_clear(w,0xffffffff));OK(tom_draw_round_rect(w,30,30,180,150,25,0xff0000ff,0x0000ffff));
 SDL_Surface *image=capture(renderer);int r,g,b;pixel(image,120,45,&r,&g,&b);assert(r>210 && b<40 && g<5);pixel(image,120,165,&r,&g,&b);assert(b>210 && r<40 && g<5);pixel(image,30,30,&r,&g,&b);assert(r==255&&g==255&&b==255);SDL_DestroySurface(image);
 OK(tom_window_clear(w,0xffffffff));OK(tom_draw_round_rect(w,20,20,100,100,0,0x00000080,0x00000080));image=capture(renderer);pixel(image,60,60,&r,&g,&b);assert(r>=125&&r<=129&&r==g&&g==b);SDL_DestroySurface(image);
 OK(tom_window_clear(w,0xffffffff));OK(tom_window_clip(w,80,80,30,30));OK(tom_draw_round_rect(w,10,10,220,180,500,0x000000ff,0x000000ff));OK(tom_draw_visual_transform(w,v,100,100,1.5,.75,32,0x33aa88aa));OK(tom_window_unclip(w));image=capture(renderer);pixel(image,79,90,&r,&g,&b);assert(r==255&&g==255&&b==255);pixel(image,90,90,&r,&g,&b);assert(g<255);SDL_DestroySurface(image);
 OK(tom_visual_catalog_new(w,2,&catalog));OK(tom_visual_catalog_text(catalog,font,"fixed texture",&id));
 int64_t baseline=tom_live_objects();for(int i=0;i<100;i++){OK(tom_window_clear(w,0xffffffff));OK(tom_draw_visual_transform(w,v,150,130,1.2,.9,i*3,0x000000ff));OK(tom_visual_catalog_transform(w,catalog,id,80,80,1,1,i,0x00000088));OK(tom_window_present(w));assert(tom_live_objects()==baseline);}
 int32_t unchanged;OK(tom_visual_metric(v,0,&unchanged));assert(width==unchanged);
 assert(tom_draw_visual_transform(w,v,0,0,0,1,0,0)==TOM_INVALID);assert(tom_draw_visual_transform(w,v,0,0,1,1,NAN,0)==TOM_INVALID);assert(tom_draw_visual_transform(w,v,0,0,100000,1,0,0)==TOM_INVALID);
 assert(tom_draw_round_rect(w,0,0,-1,1,1,0,0)==TOM_INVALID);assert(tom_draw_round_rect(w,0,0,1,1,INFINITY,0,0)==TOM_INVALID);OK(tom_draw_round_rect(w,0,0,0,1,0,0,0));
 OK(tom_window_new("Other",100,100,&other));assert(tom_draw_visual_transform(other,v,0,0,1,1,0,0)==TOM_RESOURCE);assert(tom_visual_catalog_transform(other,catalog,id,0,0,1,1,0,0)==TOM_RESOURCE);tom_window_free(other);
 OK(tom_visual_catalog_remove(catalog,id));assert(tom_visual_catalog_transform(w,catalog,id,0,0,1,1,0,0)==TOM_RESOURCE);
 assert(SDL_SetWindowSize(native,640,480));SDL_PumpEvents();OK(tom_draw_round_rect(w,20,20,100,100,10,0xffffffff,0x777777ff));OK(tom_draw_visual_transform(w,v,100,100,1.1,1.1,15,0x112233ff));OK(tom_window_present(w));
 tom_window_free(w);assert(tom_draw_visual_transform(w,v,0,0,1,1,0,0)==TOM_RESOURCE);tom_visual_catalog_free(catalog);tom_visual_free(v);tom_font_free(font);assert(tom_live_objects()==0);puts("visual-runtime-ok");
}
