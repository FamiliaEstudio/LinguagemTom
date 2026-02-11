#include <SDL2/SDL.h>
#include <GL/glew.h>

#ifdef _WIN32
#include <windows.h>
#else
#include <dlfcn.h>
#endif

#include <nlohmann/json.hpp>

#define STB_IMAGE_IMPLEMENTATION
#include "stb_image.h"

#include <algorithm>
#include <atomic>
#include <cstdint>
#include <cstring>
#include <fstream>
#include <iostream>
#include <mutex>
#include <optional>
#include <regex>
#include <sstream>
#include <string>
#include <thread>
#include <unordered_map>
#include <vector>

namespace {

using json = nlohmann::json;

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

struct TimeState {
  float deltaSeconds = 0.0f;
  float totalSeconds = 0.0f;
};

struct GpuBuffer {
  std::string name;
  std::string scalarType;
  int scalarBits = 32;
  size_t count = 0;
  size_t byteSize = 0;
  GLuint ssbo = 0;
  int binding = -1;
};

struct KernelProgram {
  std::string name;
  GLuint program = 0;
  int localSizeX = 1;
  int localSizeY = 1;
  int localSizeZ = 1;
  std::vector<std::string> pushConstantNames;
};

struct DispatchCommand {
  std::string kernelName;
  uint32_t x = 1;
  uint32_t y = 1;
  uint32_t z = 1;
};

struct PresentCommand {
  std::string bufferName;
  int width = 0;
  int height = 0;
};

SDL_Window* g_window = nullptr;
SDL_GLContext g_glContext = nullptr;
SDL_AudioDeviceID g_audioDevice = 0;
SDL_AudioSpec g_audioSpec{};
constexpr int kAudioSampleRate = 44100;
constexpr int kAudioChannels = 1;
constexpr uint32_t kAudioMaxQueueBytes = static_cast<uint32_t>(kAudioSampleRate * kAudioChannels * sizeof(float));

std::mutex g_inputMutex;
InputState g_inputState;
std::mutex g_timeMutex;
TimeState g_timeState;

std::mutex g_commandMutex;
std::vector<DispatchCommand> g_dispatchQueue;
std::optional<PresentCommand> g_pendingPresent;

std::unordered_map<std::string, GpuBuffer> g_gpuBuffers;
std::unordered_map<std::string, KernelProgram> g_kernelPrograms;

GLuint g_presentTexture = 0;
GLuint g_presentProgram = 0;
GLuint g_presentVao = 0;

std::atomic<bool> g_runtimeReady{false};

std::string readTextFile(const std::string& path) {
  std::ifstream input(path);
  if (!input) {
    return {};
  }
  std::stringstream buffer;
  buffer << input.rdbuf();
  return buffer.str();
}

size_t scalarByteSize(const std::string& scalarType, int bits) {
  if (bits > 0) {
    return static_cast<size_t>(bits / 8);
  }
  if (scalarType == "In64" || scalarType == "Fl64") return 8;
  if (scalarType == "In16") return 2;
  if (scalarType == "In8") return 1;
  return 4;
}

void destroyGlResources() {
  for (auto& [_, kernel] : g_kernelPrograms) {
    if (kernel.program != 0) {
      glDeleteProgram(kernel.program);
      kernel.program = 0;
    }
  }
  g_kernelPrograms.clear();

  for (auto& [_, buffer] : g_gpuBuffers) {
    if (buffer.ssbo != 0) {
      glDeleteBuffers(1, &buffer.ssbo);
      buffer.ssbo = 0;
    }
  }
  g_gpuBuffers.clear();

  if (g_presentProgram != 0) {
    glDeleteProgram(g_presentProgram);
    g_presentProgram = 0;
  }
  if (g_presentTexture != 0) {
    glDeleteTextures(1, &g_presentTexture);
    g_presentTexture = 0;
  }
  if (g_presentVao != 0) {
    glDeleteVertexArrays(1, &g_presentVao);
    g_presentVao = 0;
  }
}

GLuint compileShader(GLenum type, const std::string& source, const std::string& debugName) {
  GLuint shader = glCreateShader(type);
  const char* src = source.c_str();
  glShaderSource(shader, 1, &src, nullptr);
  glCompileShader(shader);

  GLint ok = GL_FALSE;
  glGetShaderiv(shader, GL_COMPILE_STATUS, &ok);
  if (ok == GL_FALSE) {
    GLint logLength = 0;
    glGetShaderiv(shader, GL_INFO_LOG_LENGTH, &logLength);
    std::string log(static_cast<size_t>(std::max(0, logLength)), '\0');
    if (logLength > 0) {
      glGetShaderInfoLog(shader, logLength, nullptr, log.data());
    }
    std::cerr << "Falha ao compilar shader '" << debugName << "':\n" << log << std::endl;
    glDeleteShader(shader);
    return 0;
  }

  return shader;
}

GLuint linkProgram(const std::vector<GLuint>& shaders, const std::string& debugName) {
  GLuint program = glCreateProgram();
  for (GLuint shader : shaders) {
    glAttachShader(program, shader);
  }
  glLinkProgram(program);

  GLint ok = GL_FALSE;
  glGetProgramiv(program, GL_LINK_STATUS, &ok);
  if (ok == GL_FALSE) {
    GLint logLength = 0;
    glGetProgramiv(program, GL_INFO_LOG_LENGTH, &logLength);
    std::string log(static_cast<size_t>(std::max(0, logLength)), '\0');
    if (logLength > 0) {
      glGetProgramInfoLog(program, logLength, nullptr, log.data());
    }
    std::cerr << "Falha ao linkar programa '" << debugName << "':\n" << log << std::endl;
    glDeleteProgram(program);
    return 0;
  }

  for (GLuint shader : shaders) {
    glDetachShader(program, shader);
    glDeleteShader(shader);
  }
  return program;
}

std::string adaptManifestGlslForOpenGL(std::string glslSource, const std::vector<std::string>& pushConstantNames) {
  const std::regex pushBlock(R"(layout\(push_constant\)\s+uniform\s+\w+\s*\{[^\}]*\}\s*\w+\s*;)", std::regex::icase | std::regex::multiline);
  glslSource = std::regex_replace(glslSource, pushBlock, "");

  std::string uniforms;
  for (const auto& name : pushConstantNames) {
    uniforms += "uniform int " + name + ";\n";
    const std::string pcName = "pc." + name;
    size_t pos = 0;
    while ((pos = glslSource.find(pcName, pos)) != std::string::npos) {
      glslSource.replace(pos, pcName.size(), name);
      pos += name.size();
    }
  }

  const std::string versionTag = "#version";
  size_t versionPos = glslSource.find(versionTag);
  if (versionPos != std::string::npos) {
    size_t lineEnd = glslSource.find('\n', versionPos);
    if (lineEnd != std::string::npos) {
      glslSource.insert(lineEnd + 1, "\n" + uniforms + "\n");
    } else {
      glslSource += "\n" + uniforms + "\n";
    }
  } else {
    glslSource = "#version 430\n\n" + uniforms + "\n" + glslSource;
  }
  return glslSource;
}

bool createPresentPipeline() {
  static const char* vertexSrc = R"(#version 430
void main() {
  vec2 pos = vec2((gl_VertexID & 1) * 2 - 1, ((gl_VertexID >> 1) & 1) * 2 - 1);
  gl_Position = vec4(pos.x, -pos.y, 0.0, 1.0);
}
)";

  static const char* fragmentSrc = R"(#version 430
uniform sampler2D uTex;
out vec4 fragColor;
void main() {
  vec2 uv = gl_FragCoord.xy / vec2(textureSize(uTex, 0));
  fragColor = texture(uTex, uv);
}
)";

  GLuint vs = compileShader(GL_VERTEX_SHADER, vertexSrc, "present_vs");
  GLuint fs = compileShader(GL_FRAGMENT_SHADER, fragmentSrc, "present_fs");
  if (vs == 0 || fs == 0) return false;
  g_presentProgram = linkProgram({vs, fs}, "present_program");
  if (g_presentProgram == 0) return false;

  glGenVertexArrays(1, &g_presentVao);
  glGenTextures(1, &g_presentTexture);
  glBindTexture(GL_TEXTURE_2D, g_presentTexture);
  glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_NEAREST);
  glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_NEAREST);
  glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_CLAMP_TO_EDGE);
  glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_CLAMP_TO_EDGE);
  glBindTexture(GL_TEXTURE_2D, 0);
  return true;
}

bool loadRuntimeManifest(const std::string& manifestPath) {
  const std::string jsonText = readTextFile(manifestPath);
  if (jsonText.empty()) {
    std::cerr << "Manifesto GPU nao encontrado: " << manifestPath << std::endl;
    return false;
  }

  json manifest;
  try {
    manifest = json::parse(jsonText);
  } catch (const std::exception& ex) {
    std::cerr << "Falha ao parsear JSON do manifesto: " << ex.what() << std::endl;
    return false;
  }

  if (manifest.contains("buffers") && manifest["buffers"].is_array()) {
    int binding = 0;
    for (const auto& b : manifest["buffers"]) {
      GpuBuffer buf;
      buf.name = b.value("name", "");
      buf.scalarType = b.value("scalarType", "In32");
      buf.scalarBits = b.value("scalarBits", 32);
      buf.count = b.value("count", 0);
      buf.byteSize = std::max<size_t>(1, buf.count * scalarByteSize(buf.scalarType, buf.scalarBits));
      buf.binding = binding++;

      glGenBuffers(1, &buf.ssbo);
      glBindBuffer(GL_SHADER_STORAGE_BUFFER, buf.ssbo);
      glBufferData(GL_SHADER_STORAGE_BUFFER, static_cast<GLsizeiptr>(buf.byteSize), nullptr, GL_DYNAMIC_COPY);
      glBindBufferBase(GL_SHADER_STORAGE_BUFFER, static_cast<GLuint>(buf.binding), buf.ssbo);
      glBindBuffer(GL_SHADER_STORAGE_BUFFER, 0);

      g_gpuBuffers.emplace(buf.name, std::move(buf));
    }
  }

  if (manifest.contains("kernels") && manifest["kernels"].is_array()) {
    for (const auto& k : manifest["kernels"]) {
      KernelProgram kernel;
      kernel.name = k.value("name", "");
      const auto backend = k["backends"]["glsl_compute"];
      kernel.localSizeX = backend["localSize"].value("x", 1);
      kernel.localSizeY = backend["localSize"].value("y", 1);
      kernel.localSizeZ = backend["localSize"].value("z", 1);

      if (backend.contains("pushConstants") && backend["pushConstants"].is_array()) {
        for (const auto& pc : backend["pushConstants"]) {
          kernel.pushConstantNames.push_back(pc.value("name", ""));
        }
      }

      std::string src = backend.value("source", "");
      src = adaptManifestGlslForOpenGL(src, kernel.pushConstantNames);

      GLuint cs = compileShader(GL_COMPUTE_SHADER, src, kernel.name);
      if (cs == 0) {
        std::cerr << "Kernel ignorado por falha de compilacao: " << kernel.name << std::endl;
        continue;
      }
      kernel.program = linkProgram({cs}, kernel.name);
      if (kernel.program == 0) {
        continue;
      }

      if (backend.contains("bufferBindings") && backend["bufferBindings"].is_array()) {
        for (const auto& binding : backend["bufferBindings"]) {
          const std::string bufferName = binding.value("name", "");
          auto it = g_gpuBuffers.find(bufferName);
          if (it == g_gpuBuffers.end()) {
            continue;
          }
          const int b = binding.value("binding", it->second.binding);
          it->second.binding = b;
          glBindBufferBase(GL_SHADER_STORAGE_BUFFER, static_cast<GLuint>(b), it->second.ssbo);
        }
      }

      g_kernelPrograms.emplace(kernel.name, std::move(kernel));
    }
  }

  std::cout << "Manifesto GPU carregado. Buffers=" << g_gpuBuffers.size() << " Kernels=" << g_kernelPrograms.size() << std::endl;
  return true;
}

void executeDispatch(const DispatchCommand& cmd) {
  auto kernelIt = g_kernelPrograms.find(cmd.kernelName);
  if (kernelIt == g_kernelPrograms.end()) {
    std::cerr << "TomGpu_Dispatch: kernel nao encontrado: " << cmd.kernelName << std::endl;
    return;
  }

  KernelProgram& kernel = kernelIt->second;
  glUseProgram(kernel.program);
  for (const auto& [_, buffer] : g_gpuBuffers) {
    if (buffer.ssbo != 0 && buffer.binding >= 0) {
      glBindBufferBase(GL_SHADER_STORAGE_BUFFER, static_cast<GLuint>(buffer.binding), buffer.ssbo);
    }
  }

  for (const std::string& pushName : kernel.pushConstantNames) {
    GLint location = glGetUniformLocation(kernel.program, pushName.c_str());
    if (location >= 0) {
      glUniform1i(location, 0);
    }
  }

  glDispatchCompute(cmd.x, cmd.y, cmd.z);
  glMemoryBarrier(GL_SHADER_STORAGE_BARRIER_BIT | GL_TEXTURE_FETCH_BARRIER_BIT);
}

void renderBufferToScreen(const PresentCommand& cmd) {
  auto bufferIt = g_gpuBuffers.find(cmd.bufferName);
  if (bufferIt == g_gpuBuffers.end()) {
    std::cerr << "TomGpu_Apresentar: buffer nao encontrado: " << cmd.bufferName << std::endl;
    return;
  }

  if (cmd.width <= 0 || cmd.height <= 0) {
    return;
  }

  const size_t pixelCount = static_cast<size_t>(cmd.width) * static_cast<size_t>(cmd.height);
  const size_t bytesNeeded = pixelCount * sizeof(uint32_t);
  std::vector<uint32_t> pixels(pixelCount, 0u);

  glBindBuffer(GL_SHADER_STORAGE_BUFFER, bufferIt->second.ssbo);
  const GLsizeiptr readSize = static_cast<GLsizeiptr>(std::min(bytesNeeded, bufferIt->second.byteSize));
  glGetBufferSubData(GL_SHADER_STORAGE_BUFFER, 0, readSize, pixels.data());
  glBindBuffer(GL_SHADER_STORAGE_BUFFER, 0);

  glBindTexture(GL_TEXTURE_2D, g_presentTexture);
  glTexImage2D(GL_TEXTURE_2D, 0, GL_RGBA8, cmd.width, cmd.height, 0, GL_RGBA, GL_UNSIGNED_BYTE, pixels.data());

  int w = cmd.width;
  int h = cmd.height;
  SDL_SetWindowSize(g_window, w, h);
  glViewport(0, 0, w, h);
  glClearColor(0.0f, 0.0f, 0.0f, 1.0f);
  glClear(GL_COLOR_BUFFER_BIT);

  glUseProgram(g_presentProgram);
  GLint texLoc = glGetUniformLocation(g_presentProgram, "uTex");
  glUniform1i(texLoc, 0);
  glActiveTexture(GL_TEXTURE0);
  glBindTexture(GL_TEXTURE_2D, g_presentTexture);
  glBindVertexArray(g_presentVao);
  glDrawArrays(GL_TRIANGLE_STRIP, 0, 4);

  SDL_GL_SwapWindow(g_window);
}

void processPendingGpuCommands() {
  std::vector<DispatchCommand> dispatches;
  std::optional<PresentCommand> present;

  {
    std::lock_guard<std::mutex> lock(g_commandMutex);
    dispatches.swap(g_dispatchQueue);
    present = g_pendingPresent;
    g_pendingPresent.reset();
  }

  for (const auto& dispatch : dispatches) {
    executeDispatch(dispatch);
  }

  if (present.has_value()) {
    renderBufferToScreen(*present);
  }
}

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
  return "erro Win32=" + std::to_string(GetLastError());
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

extern "C" void TomGpu_Dispatch(const char* kernel_name, int32_t x, int32_t y, int32_t z) {
  if (!g_runtimeReady.load(std::memory_order_acquire) || kernel_name == nullptr) {
    return;
  }

  DispatchCommand cmd;
  cmd.kernelName = kernel_name;
  cmd.x = static_cast<uint32_t>(std::max(1, x));
  cmd.y = static_cast<uint32_t>(std::max(1, y));
  cmd.z = static_cast<uint32_t>(std::max(1, z));

  std::lock_guard<std::mutex> lock(g_commandMutex);
  g_dispatchQueue.push_back(std::move(cmd));
}

extern "C" void TomGpu_Apresentar(const char* buffer_name, int32_t width, int32_t height) {
  if (!g_runtimeReady.load(std::memory_order_acquire) || buffer_name == nullptr) {
    return;
  }
  std::lock_guard<std::mutex> lock(g_commandMutex);
  g_pendingPresent = PresentCommand{buffer_name, width, height};
}

extern "C" void TomGpu_Present(int32_t* buffer_ptr, int32_t width, int32_t height) {
  if (!g_runtimeReady.load(std::memory_order_acquire) || buffer_ptr == nullptr || width <= 0 || height <= 0) {
    return;
  }

  auto it = g_gpuBuffers.find("BufTela");
  if (it == g_gpuBuffers.end()) {
    return;
  }

  const size_t pixelCount = static_cast<size_t>(width) * static_cast<size_t>(height);
  const size_t bytesNeeded = pixelCount * sizeof(uint32_t);
  glBindBuffer(GL_SHADER_STORAGE_BUFFER, it->second.ssbo);
  glBufferSubData(GL_SHADER_STORAGE_BUFFER, 0, static_cast<GLsizeiptr>(std::min(bytesNeeded, it->second.byteSize)), buffer_ptr);
  glBindBuffer(GL_SHADER_STORAGE_BUFFER, 0);

  TomGpu_Apresentar("BufTela", width, height);
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
    buffer_destino[dst_index] = static_cast<int>((static_cast<uint32_t>(a) << 24) |
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

int main(int argc, char** argv) {
  if (argc < 2) {
    std::cerr << "Uso: ./tom_gpu_host <modulo_tom.(so|dll)> [manifesto.json]" << std::endl;
    return 1;
  }

  if (SDL_Init(SDL_INIT_VIDEO | SDL_INIT_AUDIO) != 0) {
    std::cerr << "Falha ao iniciar SDL2: " << SDL_GetError() << std::endl;
    return 1;
  }

  SDL_GL_SetAttribute(SDL_GL_CONTEXT_MAJOR_VERSION, 4);
  SDL_GL_SetAttribute(SDL_GL_CONTEXT_MINOR_VERSION, 3);
  SDL_GL_SetAttribute(SDL_GL_CONTEXT_PROFILE_MASK, SDL_GL_CONTEXT_PROFILE_CORE);
  SDL_GL_SetAttribute(SDL_GL_DOUBLEBUFFER, 1);

  g_window = SDL_CreateWindow("TomGPU Compute Runtime",
                              SDL_WINDOWPOS_CENTERED,
                              SDL_WINDOWPOS_CENTERED,
                              640,
                              480,
                              SDL_WINDOW_OPENGL | SDL_WINDOW_RESIZABLE | SDL_WINDOW_SHOWN);
  if (!g_window) {
    std::cerr << "Falha ao criar janela: " << SDL_GetError() << std::endl;
    SDL_Quit();
    return 1;
  }

  g_glContext = SDL_GL_CreateContext(g_window);
  if (!g_glContext) {
    std::cerr << "Falha ao criar contexto OpenGL: " << SDL_GetError() << std::endl;
    SDL_DestroyWindow(g_window);
    SDL_Quit();
    return 1;
  }

  SDL_GL_SetSwapInterval(1);

  glewExperimental = GL_TRUE;
  const GLenum glewErr = glewInit();
  if (glewErr != GLEW_OK) {
    std::cerr << "Falha no GLEW: " << glewGetErrorString(glewErr) << std::endl;
    SDL_GL_DeleteContext(g_glContext);
    SDL_DestroyWindow(g_window);
    SDL_Quit();
    return 1;
  }

  std::cout << "OpenGL inicializado: " << glGetString(GL_VERSION) << std::endl;

  if (!createPresentPipeline()) {
    std::cerr << "Falha ao criar pipeline de apresentacao." << std::endl;
    destroyGlResources();
    SDL_GL_DeleteContext(g_glContext);
    SDL_DestroyWindow(g_window);
    SDL_Quit();
    return 1;
  }

  const std::string manifestPath = (argc >= 3) ? argv[2] : "output.gpu.json";
  if (!loadRuntimeManifest(manifestPath)) {
    std::cerr << "Continuando sem manifesto GPU valido (modo compatibilidade)." << std::endl;
  }

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
    destroyGlResources();
    SDL_GL_DeleteContext(g_glContext);
    SDL_DestroyWindow(g_window);
    SDL_Quit();
    return 1;
  }

  using TomMainFn = int (*)();
  auto* tomMain = reinterpret_cast<TomMainFn>(lookupTomSymbol(handle, "main"));
  if (!tomMain) {
    std::cerr << "Simbolo 'main' nao encontrado no modulo Tom." << std::endl;
    closeTomModule(handle);
    destroyGlResources();
    SDL_GL_DeleteContext(g_glContext);
    SDL_DestroyWindow(g_window);
    SDL_Quit();
    return 1;
  }

  g_runtimeReady.store(true, std::memory_order_release);

  std::thread tomThread([tomMain]() {
    tomMain();
  });
  tomThread.detach();

  uint64_t previousCounter = SDL_GetPerformanceCounter();
  float totalSeconds = 0.0f;
  bool running = true;

  while (running) {
    const uint64_t currentCounter = SDL_GetPerformanceCounter();
    const uint64_t counterDelta = currentCounter - previousCounter;
    previousCounter = currentCounter;
    const double freq = static_cast<double>(SDL_GetPerformanceFrequency());
    const float dt = static_cast<float>(freq > 0.0 ? static_cast<double>(counterDelta) / freq : 0.0);
    totalSeconds += std::max(0.0f, dt);
    TomGpu_AtualizarTempo(dt, totalSeconds);

    SDL_Event event;
    while (SDL_PollEvent(&event)) {
      if (event.type == SDL_QUIT) {
        running = false;
      }
    }

    {
      std::lock_guard<std::mutex> lock(g_inputMutex);
      int mouseX = 0;
      int mouseY = 0;
      g_inputState.mouseButtons = SDL_GetMouseState(&mouseX, &mouseY);
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

    processPendingGpuCommands();
    SDL_Delay(1);
  }

  g_runtimeReady.store(false, std::memory_order_release);

  if (g_audioDevice != 0) {
    SDL_ClearQueuedAudio(g_audioDevice);
    SDL_CloseAudioDevice(g_audioDevice);
    g_audioDevice = 0;
  }

  closeTomModule(handle);
  destroyGlResources();

  if (g_glContext) {
    SDL_GL_DeleteContext(g_glContext);
    g_glContext = nullptr;
  }
  if (g_window) {
    SDL_DestroyWindow(g_window);
    g_window = nullptr;
  }

  SDL_Quit();
  return 0;
}
