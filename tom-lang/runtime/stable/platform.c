#include "platform.h"
#include <SDL3/SDL_main.h>
#include <stdlib.h>
#include <string.h>
static int started, video_refs, audio_refs;
static int32_t start(void) {
  if (!started) {
    SDL_SetMainReady();
    if (!SDL_Init(0)) return TOM_RESOURCE;
    if (atexit(SDL_Quit)) { SDL_Quit(); return TOM_RESOURCE; }
    started = 1;
  }
  return TOM_OK;
}
int32_t tom_sdl_acquire(SDL_InitFlags flags) {
  int32_t error = start(); if (error) return error;
  int *count = flags == SDL_INIT_VIDEO ? &video_refs : flags == SDL_INIT_AUDIO ? &audio_refs : NULL;
  if (!count) return TOM_INVALID;
#ifndef _WIN32
  if (flags == SDL_INIT_AUDIO && !SDL_GetEnvironmentVariable(SDL_GetEnvironment(), "ALSA_CONFIG_DIR")) {
    const char *base = SDL_GetBasePath();
    if (base) {
      char *directory = malloc(strlen(base) + sizeof("alsa"));
      if (!directory) return TOM_MEMORY;
      strcpy(directory,base);strcat(directory,"alsa");
      // libasound reads the process environment, independently of SDL's cache.
      int failed = SDL_setenv_unsafe("ALSA_CONFIG_DIR",directory,0);
      if (!failed) failed = !SDL_SetEnvironmentVariable(SDL_GetEnvironment(),"ALSA_CONFIG_DIR",directory,false);
      free(directory); if (failed) return TOM_RESOURCE;
    }
  }
#endif
  if (!*count && !SDL_InitSubSystem(flags)) return TOM_RESOURCE;
  (*count)++; return TOM_OK;
}
void tom_sdl_release(SDL_InitFlags flags) {
  int *count = flags == SDL_INIT_VIDEO ? &video_refs : &audio_refs;
  if (*count && !--*count) SDL_QuitSubSystem(flags);
  // Keep SDL's timer epoch alive until process exit, independently of devices.
}
#ifdef TOM_UI_TEST
static int64_t fake_time = -1;
void tom_test_time_set(int64_t time) { fake_time = time; }
int64_t tom_test_time_get(void) { return fake_time; }
#endif
int32_t tom_time_now(int64_t *out) {
  if (!out) return TOM_INVALID;
  int32_t error = start(); if (error) return error;
#ifdef TOM_UI_TEST
  if (fake_time >= 0) { *out = fake_time; return TOM_OK; }
#endif
  Uint64 value = SDL_GetTicksNS(); if (value > INT64_MAX) return TOM_OVERFLOW;
  *out = (int64_t)value; return TOM_OK;
}
int32_t tom_asset_path(const char *relative, char **out) {
  if (!out || !tom_utf8_valid(relative) || !*relative || *relative == '/' || *relative == '\\' || strchr(relative, ':')) return TOM_INVALID;
  // A resource name always denotes a file inside the executable's assets/ tree.
  for (const char *p = relative; *p;) {
    const char *end = p; while (*end && *end != '/' && *end != '\\') end++;
    size_t n = (size_t)(end - p);
    if (!n || (n == 1 && p[0] == '.') || (n == 2 && p[0] == '.' && p[1] == '.')) return TOM_INVALID;
    p = *end ? end + 1 : end;
  }
  const char *base = SDL_GetBasePath(); if (!base) return TOM_RESOURCE;
  size_t n = strlen(base) + strlen(relative) + sizeof("assets/");
  char *file = malloc(n); if (!file) return TOM_MEMORY;
  strcpy(file, base); strcat(file, "assets/"); strcat(file, relative);
  for (char *p = file; *p; p++) if (*p == '\\') *p = '/';
  *out = file; return TOM_OK;
}
