#include <SDL2/SDL.h>

#ifdef _WIN32
#include <windows.h>
#else
#include <dlfcn.h>
#endif

#include <algorithm>
#include <atomic>
#include <cmath>
#include <cstdint>
#include <cstring>
#include <iostream>
#include <limits>
#include <mutex>
#include <string>
#include <thread>
#include <vector>

#define STB_IMAGE_IMPLEMENTATION
#include "stb_image.h"

namespace {
struct FrameState {
  std::vector<uint32_t> pixels;
  int width = 0;
  int height = 0;
  std::atomic<bool> ready{false};
} g_frame;

std::mutex g_frameMutex;

struct InputState {
  int32_t mouseX = 0;
  int32_t mouseY = 0;
  int32_t mouseButtons = 0;
  int32_t keyW = 0;
  int32_t keyA = 0;
  int32_t keyS = 0;
  int32_t keyD = 0;
  int32_t keyUp = 0;
  int32_t keyDown = 0;
  int32_t keyLeft = 0;
  int32_t keyRight = 0;
};

InputState g_inputState;
std::mutex g_inputMutex;

struct TimeState {
  float deltaSeconds = 0.0f;
  float totalSeconds = 0.0f;
};

TimeState g_timeState;
std::mutex g_timeMutex;

SDL_Window* g_window = nullptr;
SDL_Renderer* g_renderer = nullptr;
SDL_Texture* g_texture = nullptr;
SDL_AudioDeviceID g_audioDevice = 0;
SDL_AudioSpec g_audioSpec{};
constexpr int kAudioSampleRate = 44100;
constexpr int kAudioChannels = 1;
constexpr uint32_t kAudioMaxQueueBytes = static_cast<uint32_t>(kAudioSampleRate * kAudioChannels * sizeof(float));

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
  std::lock_guard<std::mutex> lock(g_frameMutex);
  g_frame.pixels.resize(count);
  std::memcpy(g_frame.pixels.data(), buffer_ptr, count * sizeof(uint32_t));
  g_frame.width = width;
  g_frame.height = height;
  g_frame.ready.store(true, std::memory_order_release);
}

extern "C" void TomGpu_LerInput(int32_t* buffer_destino) {
  if (buffer_destino == nullptr) {
    return;
  }

  std::lock_guard<std::mutex> lock(g_inputMutex);
  buffer_destino[0] = g_inputState.mouseX;
  buffer_destino[1] = g_inputState.mouseY;
  buffer_destino[2] = g_inputState.mouseButtons;
  buffer_destino[3] = g_inputState.keyW;
  buffer_destino[4] = g_inputState.keyA;
  buffer_destino[5] = g_inputState.keyS;
  buffer_destino[6] = g_inputState.keyD;
  buffer_destino[7] = g_inputState.keyUp;
  buffer_destino[8] = g_inputState.keyDown;
  buffer_destino[9] = g_inputState.keyLeft;
  buffer_destino[10] = g_inputState.keyRight;
}

extern "C" void TomGpu_AtualizarTempo(float dt, float tempo_total) {
  std::lock_guard<std::mutex> lock(g_timeMutex);
  g_timeState.deltaSeconds = dt;
  g_timeState.totalSeconds = tempo_total;
}

extern "C" float TomGpu_ObterDeltaTempo() {
  std::lock_guard<std::mutex> lock(g_timeMutex);
  return g_timeState.deltaSeconds;
}

extern "C" float TomGpu_ObterTempoTotal() {
  std::lock_guard<std::mutex> lock(g_timeMutex);
  return g_timeState.totalSeconds;
}

extern "C" void TomGpu_CarregarImagem(char* caminho, int* buffer_destino, int largura_max, int altura_max) {
  if (caminho == nullptr || buffer_destino == nullptr || largura_max <= 0 || altura_max <= 0) {
    return;
  }

  int largura = 0;
  int altura = 0;
  int canais = 0;
  unsigned char* pixels = stbi_load(caminho, &largura, &altura, &canais, 4);
  if (pixels == nullptr) {
    std::cerr << "Falha ao carregar imagem '" << caminho << "': " << stbi_failure_reason() << std::endl;
    buffer_destino[0] = 0;
    buffer_destino[1] = 0;
    return;
  }

  const int max_pixels = std::max(0, largura_max) * std::max(0, altura_max);
  const int pixels_arquivo = largura * altura;
  const int pixels_copiados = std::min(max_pixels, pixels_arquivo);
  buffer_destino[0] = largura;
  buffer_destino[1] = altura;

  for (int i = 0; i < pixels_copiados; ++i) {
    const int src_index = i * 4;
    const int dst_index = 2 + i;
    const uint8_t r = pixels[src_index + 0];
    const uint8_t g = pixels[src_index + 1];
    const uint8_t b = pixels[src_index + 2];
    const uint8_t a = pixels[src_index + 3];
    buffer_destino[dst_index] =
        static_cast<int>((static_cast<uint32_t>(a) << 24) |
                         (static_cast<uint32_t>(b) << 16) |
                         (static_cast<uint32_t>(g) << 8) |
                         static_cast<uint32_t>(r));
  }

  stbi_image_free(pixels);
}

extern "C" void TomGpu_EnfileirarAudio(float* samples, int count) {
  if (g_audioDevice == 0 || samples == nullptr || count <= 0) {
    return;
  }

  const uint32_t queuedBytes = SDL_GetQueuedAudioSize(g_audioDevice);
  if (queuedBytes > kAudioMaxQueueBytes) {
    SDL_ClearQueuedAudio(g_audioDevice);
  }

  const uint32_t payloadBytes = static_cast<uint32_t>(count) * static_cast<uint32_t>(sizeof(float));
  if (SDL_QueueAudio(g_audioDevice, samples, payloadBytes) != 0) {
    std::cerr << "Falha ao enfileirar audio: " << SDL_GetError() << std::endl;
  }
}


namespace {
using TomModuleHandle =
#ifdef _WIN32
    HMODULE;
#else
    void*;
#endif

TomModuleHandle openTomModule(const char* modulePath) {
#ifdef _WIN32
  return LoadLibraryA(modulePath);
#else
  return dlopen(modulePath, RTLD_NOW | RTLD_GLOBAL);
#endif
}

void* lookupTomSymbol(TomModuleHandle module, const char* symbol) {
#ifdef _WIN32
  return reinterpret_cast<void*>(GetProcAddress(module, symbol));
#else
  return dlsym(module, symbol);
#endif
}

std::string getTomModuleError() {
#ifdef _WIN32
  const DWORD errorCode = GetLastError();
  return "erro Win32=" + std::to_string(errorCode);
#else
  const char* error = dlerror();
  return error ? std::string(error) : std::string("erro desconhecido");
#endif
}

void closeTomModule(TomModuleHandle module) {
#ifdef _WIN32
  if (module) FreeLibrary(module);
#else
  if (module) dlclose(module);
#endif
}
}  // namespace

int main(int argc, char** argv) {
  if (argc < 2) {
    std::cerr << "Uso: ./tom_gpu_host <modulo_tom.(so|dll)>" << std::endl;
    return 1;
  }

  if (SDL_Init(SDL_INIT_VIDEO | SDL_INIT_AUDIO) != 0) {
    std::cerr << "Falha ao iniciar SDL2: " << SDL_GetError() << std::endl;
    return 1;
  }

  g_window = SDL_CreateWindow("TomGPU Raster", SDL_WINDOWPOS_CENTERED, SDL_WINDOWPOS_CENTERED, 640, 480, SDL_WINDOW_SHOWN | SDL_WINDOW_RESIZABLE);
  g_renderer = SDL_CreateRenderer(g_window, -1, SDL_RENDERER_ACCELERATED | SDL_RENDERER_PRESENTVSYNC);

  SDL_AudioSpec desiredAudio{};
  desiredAudio.freq = kAudioSampleRate;
  desiredAudio.format = AUDIO_F32SYS;
  desiredAudio.channels = static_cast<Uint8>(kAudioChannels);
  desiredAudio.samples = 1024;
  desiredAudio.callback = nullptr;

  g_audioDevice = SDL_OpenAudioDevice(nullptr, 0, &desiredAudio, &g_audioSpec, 0);
  if (g_audioDevice == 0) {
    std::cerr << "Falha ao abrir dispositivo de audio: " << SDL_GetError() << std::endl;
  } else {
    SDL_PauseAudioDevice(g_audioDevice, 0);
  }

  TomModuleHandle handle = openTomModule(argv[1]);
  if (!handle) {
    std::cerr << "Falha ao abrir modulo: " << getTomModuleError() << std::endl;
    SDL_Quit();
    return 1;
  }

  using TomMainFn = int (*)();
  auto* tomMain = reinterpret_cast<TomMainFn>(lookupTomSymbol(handle, "main"));
  if (!tomMain) {
    std::cerr << "Simbolo 'main' nao encontrado no modulo Tom." << std::endl;
    closeTomModule(handle);
    SDL_Quit();
    return 1;
  }

  using TomTempoFn = void (*)(float, float);
  auto* tomTempoFn = reinterpret_cast<TomTempoFn>(lookupTomSymbol(handle, "TomGpu_AtualizarTempo"));

  uint64_t previousCounter = SDL_GetPerformanceCounter();
  float totalSeconds = 0.0f;

  std::thread tomThread([tomMain]() {
    tomMain();
  });
  tomThread.detach();

  bool running = true;
  while (running) {
    const uint64_t currentCounter = SDL_GetPerformanceCounter();
    const uint64_t counterDelta = currentCounter - previousCounter;
    previousCounter = currentCounter;
    const double frequency = static_cast<double>(SDL_GetPerformanceFrequency());
    const double dt64 = frequency > 0.0 ? (static_cast<double>(counterDelta) / frequency) : 0.0;
    const float dt = static_cast<float>(std::max(0.0, dt64));
    totalSeconds += dt;
    TomGpu_AtualizarTempo(dt, totalSeconds);
    if (tomTempoFn) {
      tomTempoFn(dt, totalSeconds);
    }

    SDL_Event event;
    while (SDL_PollEvent(&event)) {
      if (event.type == SDL_QUIT) {
        running = false;
      } else if (event.type == SDL_MOUSEMOTION) {
        std::lock_guard<std::mutex> lock(g_inputMutex);
        g_inputState.mouseX = event.motion.x;
        g_inputState.mouseY = event.motion.y;
      } else if (event.type == SDL_MOUSEBUTTONDOWN || event.type == SDL_MOUSEBUTTONUP) {
        std::lock_guard<std::mutex> lock(g_inputMutex);
        if (event.button.button == SDL_BUTTON_LEFT) {
          if (event.type == SDL_MOUSEBUTTONDOWN) {
            g_inputState.mouseButtons |= 1;
          } else {
            g_inputState.mouseButtons &= ~1;
          }
        }
        if (event.button.button == SDL_BUTTON_RIGHT) {
          if (event.type == SDL_MOUSEBUTTONDOWN) {
            g_inputState.mouseButtons |= 2;
          } else {
            g_inputState.mouseButtons &= ~2;
          }
        }
      }
    }

    {
      std::lock_guard<std::mutex> lock(g_inputMutex);
      int mouseX = 0;
      int mouseY = 0;
      SDL_GetMouseState(&mouseX, &mouseY);
      g_inputState.mouseX = mouseX;
      g_inputState.mouseY = mouseY;

      const Uint8* keys = SDL_GetKeyboardState(nullptr);
      g_inputState.keyW = keys[SDL_SCANCODE_W] ? 1 : 0;
      g_inputState.keyA = keys[SDL_SCANCODE_A] ? 1 : 0;
      g_inputState.keyS = keys[SDL_SCANCODE_S] ? 1 : 0;
      g_inputState.keyD = keys[SDL_SCANCODE_D] ? 1 : 0;
      g_inputState.keyUp = keys[SDL_SCANCODE_UP] ? 1 : 0;
      g_inputState.keyDown = keys[SDL_SCANCODE_DOWN] ? 1 : 0;
      g_inputState.keyLeft = keys[SDL_SCANCODE_LEFT] ? 1 : 0;
      g_inputState.keyRight = keys[SDL_SCANCODE_RIGHT] ? 1 : 0;
    }

    if (g_frame.ready.load(std::memory_order_acquire) && g_frame.width > 0 && g_frame.height > 0) {
      std::lock_guard<std::mutex> lock(g_frameMutex);
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

  if (g_audioDevice != 0) {
    SDL_ClearQueuedAudio(g_audioDevice);
    SDL_CloseAudioDevice(g_audioDevice);
    g_audioDevice = 0;
  }

  if (g_texture) SDL_DestroyTexture(g_texture);
  if (g_renderer) SDL_DestroyRenderer(g_renderer);
  if (g_window) SDL_DestroyWindow(g_window);
  closeTomModule(handle);
  SDL_Quit();
  return 0;
}
