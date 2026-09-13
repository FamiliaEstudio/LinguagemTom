#ifndef TOM_PLATFORM_H
#define TOM_PLATFORM_H
#define SDL_MAIN_HANDLED
#include <SDL3/SDL.h>
#include "tom_runtime.h"
int32_t tom_sdl_acquire(SDL_InitFlags flags);
void tom_sdl_release(SDL_InitFlags flags);
int32_t tom_asset_path(const char *relative, char **out);
#ifdef TOM_UI_TEST
void tom_test_time_set(int64_t time);
int64_t tom_test_time_get(void);
#endif
#endif
