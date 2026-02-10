#include <SDL2/SDL.h>
#include <dlfcn.h>

#include <algorithm>
#include <atomic>
#include <cstdint>
#include <cstring>
#include <iostream>
#include <string>
#include <vector>

namespace {
struct FrameState {
  std::vector<uint32_t> pixels;
  int width = 0;
  int height = 0;
  std::atomic<bool> ready{false};
} g_frame;

SDL_Window* g_window = nullptr;
SDL_Renderer* g_renderer = nullptr;
SDL_Texture* g_texture = nullptr;

void ensureTexture(int width, int height) {
  if (g_texture != nullptr) {
    int tw = 0;
    int th = 0;
    SDL_QueryTexture(g_texture, nullptr, nullptr, &tw, &th);
    if (tw == width && th == height) {
      return;
    }
    SDL_DestroyTexture(g_texture);
    g_texture = nullptr;
  }

  g_texture = SDL_CreateTexture(
      g_renderer,
      SDL_PIXELFORMAT_ARGB8888,
      SDL_TEXTUREACCESS_STREAMING,
      width,
      height);
}
}  // namespace

extern "C" void TomGpu_Present(int32_t* buffer_ptr, int32_t width, int32_t height) {
  if (buffer_ptr == nullptr || width <= 0 || height <= 0) {
    std::cerr << "TomGpu_Present recebeu parametros invalidos." << std::endl;
    return;
  }

  const size_t count = static_cast<size_t>(width) * static_cast<size_t>(height);
  g_frame.pixels.resize(count);
  std::memcpy(g_frame.pixels.data(), buffer_ptr, count * sizeof(uint32_t));
  g_frame.width = width;
  g_frame.height = height;
  g_frame.ready.store(true, std::memory_order_release);
}

int main(int argc, char** argv) {
  if (argc < 2) {
    std::cerr << "Uso: ./tom_gpu_host <modulo_tom.so>" << std::endl;
    return 1;
  }

  if (SDL_Init(SDL_INIT_VIDEO) != 0) {
    std::cerr << "Falha ao iniciar SDL2: " << SDL_GetError() << std::endl;
    return 1;
  }

  g_window = SDL_CreateWindow("TomGPU Raster", SDL_WINDOWPOS_CENTERED, SDL_WINDOWPOS_CENTERED, 640, 480, SDL_WINDOW_SHOWN | SDL_WINDOW_RESIZABLE);
  g_renderer = SDL_CreateRenderer(g_window, -1, SDL_RENDERER_ACCELERATED | SDL_RENDERER_PRESENTVSYNC);

  void* handle = dlopen(argv[1], RTLD_NOW | RTLD_GLOBAL);
  if (!handle) {
    std::cerr << "Falha ao abrir modulo: " << dlerror() << std::endl;
    SDL_Quit();
    return 1;
  }

  using TomMainFn = int (*)();
  auto* tomMain = reinterpret_cast<TomMainFn>(dlsym(handle, "main"));
  if (!tomMain) {
    std::cerr << "Simbolo 'main' nao encontrado no modulo Tom." << std::endl;
    dlclose(handle);
    SDL_Quit();
    return 1;
  }

  tomMain();

  bool running = true;
  while (running) {
    SDL_Event event;
    while (SDL_PollEvent(&event)) {
      if (event.type == SDL_QUIT) {
        running = false;
      }
    }

    if (g_frame.ready.load(std::memory_order_acquire) && g_frame.width > 0 && g_frame.height > 0) {
      ensureTexture(g_frame.width, g_frame.height);
      SDL_UpdateTexture(g_texture, nullptr, g_frame.pixels.data(), g_frame.width * static_cast<int>(sizeof(uint32_t)));
      SDL_SetWindowSize(g_window, g_frame.width, g_frame.height);
      SDL_RenderClear(g_renderer);
      SDL_RenderCopy(g_renderer, g_texture, nullptr, nullptr);
      SDL_RenderPresent(g_renderer);
    } else {
      SDL_Delay(16);
    }
  }

  if (g_texture) SDL_DestroyTexture(g_texture);
  if (g_renderer) SDL_DestroyRenderer(g_renderer);
  if (g_window) SDL_DestroyWindow(g_window);
  dlclose(handle);
  SDL_Quit();
  return 0;
}
