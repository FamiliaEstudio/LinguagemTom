#ifndef STB_IMAGE_H
#define STB_IMAGE_H

// Compatibilidade mínima de API com stb_image para o runtime TomGPU.
// Esta implementação suporta carregamento de BMP via SDL_LoadBMP e converte para RGBA8.
// Para PNG/JPG, recomenda-se substituir este arquivo pelo stb_image.h oficial.

#ifdef __cplusplus
extern "C" {
#endif

unsigned char* stbi_load(const char* filename, int* x, int* y, int* channels_in_file, int desired_channels);
void stbi_image_free(void* retval_from_stbi_load);
const char* stbi_failure_reason(void);

#ifdef __cplusplus
}
#endif

#ifdef STB_IMAGE_IMPLEMENTATION

#include <SDL2/SDL.h>
#include <cstdlib>
#include <cstring>
#include <string>

namespace stb_compat_internal {
static thread_local std::string g_reason;

static void set_reason(const char* reason) {
  g_reason = reason ? reason : "erro desconhecido";
}

static bool has_bmp_extension(const char* filename) {
  if (!filename) return false;
  const char* dot = std::strrchr(filename, '.');
  if (!dot) return false;
  return std::strcmp(dot, ".bmp") == 0 || std::strcmp(dot, ".BMP") == 0;
}
}

extern "C" unsigned char* stbi_load(const char* filename, int* x, int* y, int* channels_in_file, int desired_channels) {
  if (!filename || !x || !y) {
    stb_compat_internal::set_reason("parâmetros inválidos");
    return nullptr;
  }

  if (desired_channels != 0 && desired_channels != 4) {
    stb_compat_internal::set_reason("somente desired_channels=0 ou 4 é suportado neste build");
    return nullptr;
  }

  if (!stb_compat_internal::has_bmp_extension(filename)) {
    stb_compat_internal::set_reason("apenas BMP é suportado nesta implementação local");
    return nullptr;
  }

  SDL_Surface* original = SDL_LoadBMP(filename);
  if (!original) {
    stb_compat_internal::set_reason(SDL_GetError());
    return nullptr;
  }

  SDL_Surface* rgba = SDL_ConvertSurfaceFormat(original, SDL_PIXELFORMAT_RGBA32, 0);
  SDL_FreeSurface(original);
  if (!rgba) {
    stb_compat_internal::set_reason(SDL_GetError());
    return nullptr;
  }

  const int width = rgba->w;
  const int height = rgba->h;
  const size_t count = static_cast<size_t>(width) * static_cast<size_t>(height) * 4;
  unsigned char* out = static_cast<unsigned char*>(std::malloc(count));
  if (!out) {
    SDL_FreeSurface(rgba);
    stb_compat_internal::set_reason("falha de alocação");
    return nullptr;
  }

  std::memcpy(out, rgba->pixels, count);
  SDL_FreeSurface(rgba);

  *x = width;
  *y = height;
  if (channels_in_file) *channels_in_file = 4;
  return out;
}

extern "C" void stbi_image_free(void* retval_from_stbi_load) {
  std::free(retval_from_stbi_load);
}

extern "C" const char* stbi_failure_reason(void) {
  return stb_compat_internal::g_reason.c_str();
}

#endif

#endif
