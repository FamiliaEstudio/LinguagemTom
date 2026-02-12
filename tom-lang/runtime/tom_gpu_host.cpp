#include <SDL2/SDL.h>

#ifdef TOM_GPU_USE_GLAD
#include <glad/glad.h>
#else
#include <GL/glew.h>
#endif

#ifdef _WIN32
#include <windows.h>
#include <processthreadsapi.h>
#include <intrin.h>
#else
#include <dlfcn.h>
#include <cpuid.h>
#include <pthread.h>
#include <sched.h>
#endif

#include <nlohmann/json.hpp>

#define STB_IMAGE_IMPLEMENTATION
#include "stb_image.h"

#include <algorithm>
#include <atomic>
#include <chrono>
#include <condition_variable>
#include <cstdint>
#include <cstring>
#include <deque>
#include <fstream>
#include <functional>
#include <iostream>
#include <mutex>
#include <optional>
#include <regex>
#include <sstream>
#include <string>
#include <thread>
#include <unordered_map>
#include <unordered_set>
#include <vector>

namespace
{

  // CORREÇÃO 1: Definir readTextFile antes de ser usada
  std::string readTextFile(const std::string &path)
  {
    std::ifstream input(path);
    if (!input)
    {
      return {};
    }
    std::stringstream buffer;
    buffer << input.rdbuf();
    return buffer.str();
  }

  using json = nlohmann::json;

  struct InputState
  {
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

  struct TimeState
  {
    float deltaSeconds = 0.0f;
    float totalSeconds = 0.0f;
  };

  struct GpuBuffer
  {
    std::string name;
    std::string scalarType;
    int scalarBits = 32;
    size_t count = 0;
    size_t byteSize = 0;
    GLuint ssbo = 0;
    int binding = -1;
  };

  struct KernelProgram
  {
    std::string name;
    GLuint program = 0;
    int localSizeX = 1;
    int localSizeY = 1;
    int localSizeZ = 1;
    std::vector<std::string> pushConstantNames;
  };

  struct DispatchCommand
  {
    std::string kernelName;
    uint32_t x = 1;
    uint32_t y = 1;
    uint32_t z = 1;
  };

  struct PresentCommand
  {
    std::string bufferName;
    int width = 0;
    int height = 0;
  };

  struct BudgetSample
  {
    std::string name;
    int64_t costCycles = 0;
    double costMs = 0.0;
  };

  SDL_Window *g_window = nullptr;
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

  std::mutex g_budgetMutex;
  std::vector<BudgetSample> g_budgetSamples;
  std::unordered_map<std::string, size_t> g_budgetSampleIndex;

  GLuint g_presentTexture = 0;
  GLuint g_presentProgram = 0;
  GLuint g_presentVao = 0;

  std::atomic<bool> g_runtimeReady{false};

  class TopologyAwareScheduler
  {
  public:
    using Task = std::function<void()>;

    TopologyAwareScheduler() { start(); }

    explicit TopologyAwareScheduler(uint32_t workerCountHint) { start(workerCountHint); }

    ~TopologyAwareScheduler() { stop(); }

    TopologyAwareScheduler(const TopologyAwareScheduler &) = delete;
    TopologyAwareScheduler &operator=(const TopologyAwareScheduler &) = delete;

    void submit(Task task)
    {
      if (!task)
      {
        return;
      }

      const size_t groupCount = m_groups.size();
      if (groupCount == 0)
      {
        task();
        return;
      }

      const size_t target = m_rrSubmit.fetch_add(1, std::memory_order_relaxed) % groupCount;
      {
        std::lock_guard<std::mutex> lock(m_groups[target].queueMutex);
        m_groups[target].queue.emplace_back(std::move(task));
      }
      m_cv.notify_all();
    }

    void stop()
    {
      bool expected = false;
      if (!m_stopping.compare_exchange_strong(expected, true, std::memory_order_acq_rel))
      {
        return;
      }

      m_cv.notify_all();
      for (auto &worker : m_workers)
      {
        if (worker.thread.joinable())
        {
          worker.thread.join();
        }
      }
      m_workers.clear();
    }

  private:
    struct L3Group
    {
      std::vector<unsigned> logicalCpus;
      std::mutex queueMutex;
      std::deque<Task> queue;

      // CORREÇÃO 2: Adicionar construtores padrão e de movimento
      // std::mutex não pode ser copiado/movido automaticamente, então fazemos manual
      L3Group() = default;
      L3Group(L3Group &&other) noexcept
          : logicalCpus(std::move(other.logicalCpus)),
            queue(std::move(other.queue))
      {
        // Mutex começa novo, não copiamos o estado de bloqueio
      }
    };

    struct WorkerCtx
    {
      size_t groupIndex = 0;
      size_t cpuIndexInGroup = 0;
      std::thread thread;
    };

    std::vector<L3Group> m_groups;
    std::vector<WorkerCtx> m_workers;
    std::condition_variable m_cv;
    std::mutex m_cvMutex;
    std::atomic<bool> m_stopping{false};
    std::atomic<size_t> m_rrSubmit{0};

    void start(uint32_t workerCountHint = 0)
    {
      m_groups = discoverL3Groups();
      if (m_groups.empty())
      {
        m_groups.push_back(fallbackGroup());
      }

      uint32_t workerCount = workerCountHint;
      if (workerCount == 0)
      {
        workerCount = static_cast<uint32_t>(std::thread::hardware_concurrency());
      }
      if (workerCount == 0)
      {
        workerCount = 1;
      }

      const uint32_t maxWorkersFromTopology = totalLogicalCpuCount();
      workerCount = std::min(workerCount, std::max(1u, maxWorkersFromTopology));

      m_workers.reserve(workerCount);
      std::vector<size_t> perGroupCursor(m_groups.size(), 0);

      for (uint32_t i = 0; i < workerCount; ++i)
      {
        const size_t groupIndex = chooseGroupForWorker(i);
        const auto &cpus = m_groups[groupIndex].logicalCpus;
        size_t cpuIndexInGroup = 0;
        if (!cpus.empty())
        {
          cpuIndexInGroup = perGroupCursor[groupIndex] % cpus.size();
          perGroupCursor[groupIndex]++;
        }

        WorkerCtx worker;
        worker.groupIndex = groupIndex;
        worker.cpuIndexInGroup = cpuIndexInGroup;
        worker.thread = std::thread([this, groupIndex, cpuIndexInGroup]()
                                    {
        pinCurrentThread(groupIndex, cpuIndexInGroup);
        workerLoop(groupIndex); });
        m_workers.emplace_back(std::move(worker));
      }
    }

    size_t chooseGroupForWorker(uint32_t workerIndex) const
    {
      if (m_groups.empty())
      {
        return 0;
      }
      return static_cast<size_t>(workerIndex) % m_groups.size();
    }

    uint32_t totalLogicalCpuCount() const
    {
      uint32_t total = 0;
      for (const auto &group : m_groups)
      {
        total += static_cast<uint32_t>(group.logicalCpus.size());
      }
      return total;
    }

    static std::vector<unsigned> parseCpuRangeList(const std::string &cpuList)
    {
      std::vector<unsigned> cpus;
      std::stringstream ss(cpuList);
      std::string token;
      while (std::getline(ss, token, ','))
      {
        if (token.empty())
        {
          continue;
        }

        const size_t dash = token.find('-');
        if (dash == std::string::npos)
        {
          cpus.push_back(static_cast<unsigned>(std::stoul(token)));
          continue;
        }

        const unsigned begin = static_cast<unsigned>(std::stoul(token.substr(0, dash)));
        const unsigned end = static_cast<unsigned>(std::stoul(token.substr(dash + 1)));
        if (end < begin)
        {
          continue;
        }
        for (unsigned cpu = begin; cpu <= end; ++cpu)
        {
          cpus.push_back(cpu);
        }
      }

      std::sort(cpus.begin(), cpus.end());
      cpus.erase(std::unique(cpus.begin(), cpus.end()), cpus.end());
      return cpus;
    }

    static std::vector<L3Group> discoverL3Groups()
    {
#ifdef _WIN32
      return discoverL3GroupsWindows();
#else
      return discoverL3GroupsLinux();
#endif
    }

    static std::vector<L3Group> discoverL3GroupsLinux()
    {
      std::vector<L3Group> groups;
      std::unordered_set<std::string> visitedSharedLists;

      for (unsigned cpu = 0; cpu < 512; ++cpu)
      {
        const std::string base = "/sys/devices/system/cpu/cpu" + std::to_string(cpu) + "/cache";
        for (unsigned index = 0; index < 32; ++index)
        {
          const std::string levelPath = base + "/index" + std::to_string(index) + "/level";
          const std::string levelText = readTextFile(levelPath);
          if (levelText.empty())
          {
            continue;
          }
          if (std::stoi(levelText) != 3)
          {
            continue;
          }

          const std::string sharedPath = base + "/index" + std::to_string(index) + "/shared_cpu_list";
          std::string sharedCpuList = readTextFile(sharedPath);
          sharedCpuList.erase(std::remove(sharedCpuList.begin(), sharedCpuList.end(), '\n'), sharedCpuList.end());
          if (sharedCpuList.empty() || visitedSharedLists.find(sharedCpuList) != visitedSharedLists.end())
          {
            continue;
          }
          visitedSharedLists.insert(sharedCpuList);

          auto cpus = parseCpuRangeList(sharedCpuList);
          if (!cpus.empty())
          {
            L3Group group;
            group.logicalCpus = std::move(cpus);
            groups.emplace_back(std::move(group));
          }
        }
      }

      return groups;
    }

#ifdef _WIN32
    static std::vector<unsigned> extractCpuIdsFromMask(ULONG_PTR mask)
    {
      std::vector<unsigned> cpus;
      for (unsigned bit = 0; bit < sizeof(ULONG_PTR) * 8; ++bit)
      {
        if ((mask & (static_cast<ULONG_PTR>(1) << bit)) != 0)
        {
          cpus.push_back(bit);
        }
      }
      return cpus;
    }

    static std::vector<L3Group> discoverL3GroupsWindows()
    {
      std::vector<L3Group> groups;
      DWORD length = 0;
      GetLogicalProcessorInformation(nullptr, &length);
      if (length == 0)
      {
        return groups;
      }

      std::vector<uint8_t> buffer(length);
      auto *info = reinterpret_cast<SYSTEM_LOGICAL_PROCESSOR_INFORMATION *>(buffer.data());
      if (!GetLogicalProcessorInformation(info, &length))
      {
        return groups;
      }

      const size_t count = length / sizeof(SYSTEM_LOGICAL_PROCESSOR_INFORMATION);
      for (size_t i = 0; i < count; ++i)
      {
        const auto &entry = info[i];
        if (entry.Relationship != RelationCache)
        {
          continue;
        }
        if (entry.Cache.Level != 3)
        {
          continue;
        }

        auto cpus = extractCpuIdsFromMask(entry.ProcessorMask);
        if (!cpus.empty())
        {
          L3Group group;
          group.logicalCpus = std::move(cpus);
          groups.emplace_back(std::move(group));
        }
      }

      return groups;
    }
#endif

    static L3Group fallbackGroup()
    {
      L3Group fallback;
      const unsigned count = std::max(1u, std::thread::hardware_concurrency());
      fallback.logicalCpus.reserve(count);
      for (unsigned i = 0; i < count; ++i)
      {
        fallback.logicalCpus.push_back(i);
      }
      return fallback;
    }

    void pinCurrentThread(size_t groupIndex, size_t cpuIndexInGroup)
    {
      if (groupIndex >= m_groups.size())
      {
        return;
      }
      const auto &cpus = m_groups[groupIndex].logicalCpus;
      if (cpus.empty())
      {
        return;
      }

      const unsigned cpuId = cpus[cpuIndexInGroup % cpus.size()];

#ifdef _WIN32
      const DWORD_PTR affinityMask = (static_cast<DWORD_PTR>(1) << cpuId);
      SetThreadAffinityMask(GetCurrentThread(), affinityMask);
#else
      cpu_set_t cpuset;
      CPU_ZERO(&cpuset);
      CPU_SET(cpuId, &cpuset);
      pthread_setaffinity_np(pthread_self(), sizeof(cpu_set_t), &cpuset);
#endif
    }

    bool tryPopFromGroup(size_t groupIndex, Task &task)
    {
      if (groupIndex >= m_groups.size())
      {
        return false;
      }

      auto &group = m_groups[groupIndex];
      std::lock_guard<std::mutex> lock(group.queueMutex);
      if (group.queue.empty())
      {
        return false;
      }
      task = std::move(group.queue.front());
      group.queue.pop_front();
      return true;
    }

    bool tryStealCrossL3(size_t localGroupIndex, Task &task)
    {
      const size_t groupCount = m_groups.size();
      if (groupCount <= 1)
      {
        return false;
      }

      for (size_t offset = 1; offset < groupCount; ++offset)
      {
        const size_t remoteGroup = (localGroupIndex + offset) % groupCount;
        if (tryPopFromGroup(remoteGroup, task))
        {
          return true;
        }
      }
      return false;
    }

    void workerLoop(size_t localGroupIndex)
    {
      while (!m_stopping.load(std::memory_order_acquire))
      {
        Task task;

        if (tryPopFromGroup(localGroupIndex, task))
        {
          task();
          continue;
        }

        if (tryStealCrossL3(localGroupIndex, task))
        {
          task();
          continue;
        }

        std::unique_lock<std::mutex> lock(m_cvMutex);
        m_cv.wait_for(lock, std::chrono::milliseconds(1), [this]()
                      { return m_stopping.load(std::memory_order_acquire); });
      }
    }
  };

  int detectLogicalCoreType()
  {
#ifdef _WIN32
    PROCESSOR_NUMBER processorNumber{};
    // CORREÇÃO 3: GetCurrentProcessorNumberEx retorna VOID no Windows, não bool
    GetCurrentProcessorNumberEx(&processorNumber);

    // Código original continuava aqui...
    int cpuInfo[4] = {0, 0, 0, 0};
    (void)processorNumber;
    __cpuidex(cpuInfo, 0x1A, 0);
    if (cpuInfo[0] == 0 && cpuInfo[1] == 0 && cpuInfo[2] == 0 && cpuInfo[3] == 0)
    {
      return -1;
    }
    return (cpuInfo[0] >> 24) & 0xFF;
#else
    if (sched_getcpu() < 0)
    {
      return -1;
    }

    unsigned eax = 0;
    unsigned ebx = 0;
    unsigned ecx = 0;
    unsigned edx = 0;
    if (!__get_cpuid_count(0x1A, 0, &eax, &ebx, &ecx, &edx))
    {
      return -1;
    }
    return static_cast<int>((eax >> 24) & 0xFF);
#endif
  }

  bool isCurrentThreadOnPCore()
  {
    const int coreType = detectLogicalCoreType();
    if (coreType < 0)
    {
      return true;
    }

    constexpr int kIntelCoreTypeECore = 0x20;
    constexpr int kIntelCoreTypePCore = 0x40;

    if (coreType == kIntelCoreTypeECore)
      return false;
    if (coreType == kIntelCoreTypePCore)
      return true;
    return true;
  }

  size_t scalarByteSize(const std::string &scalarType, int bits)
  {
    if (bits > 0)
    {
      return static_cast<size_t>(bits / 8);
    }
    if (scalarType == "In64" || scalarType == "Fl64")
      return 8;
    if (scalarType == "In16")
      return 2;
    if (scalarType == "In8")
      return 1;
    return 4;
  }

  void destroyGlResources()
  {
    for (auto &[_, kernel] : g_kernelPrograms)
    {
      if (kernel.program != 0)
      {
        glDeleteProgram(kernel.program);
        kernel.program = 0;
      }
    }
    g_kernelPrograms.clear();

    for (auto &[_, buffer] : g_gpuBuffers)
    {
      if (buffer.ssbo != 0)
      {
        glDeleteBuffers(1, &buffer.ssbo);
        buffer.ssbo = 0;
      }
    }
    g_gpuBuffers.clear();

    if (g_presentProgram != 0)
    {
      glDeleteProgram(g_presentProgram);
      g_presentProgram = 0;
    }
    if (g_presentTexture != 0)
    {
      glDeleteTextures(1, &g_presentTexture);
      g_presentTexture = 0;
    }
    if (g_presentVao != 0)
    {
      glDeleteVertexArrays(1, &g_presentVao);
      g_presentVao = 0;
    }
  }

  GLuint compileShader(GLenum type, const std::string &source, const std::string &debugName)
  {
    GLuint shader = glCreateShader(type);
    const char *src = source.c_str();
    glShaderSource(shader, 1, &src, nullptr);
    glCompileShader(shader);

    GLint ok = GL_FALSE;
    glGetShaderiv(shader, GL_COMPILE_STATUS, &ok);
    if (ok == GL_FALSE)
    {
      GLint logLength = 0;
      glGetShaderiv(shader, GL_INFO_LOG_LENGTH, &logLength);
      std::string log(static_cast<size_t>(std::max(0, logLength)), '\0');
      if (logLength > 0)
      {
        glGetShaderInfoLog(shader, logLength, nullptr, log.data());
      }
      std::cerr << "Falha ao compilar shader '" << debugName << "':\n"
                << log << std::endl;
      glDeleteShader(shader);
      return 0;
    }

    return shader;
  }

  GLuint linkProgram(const std::vector<GLuint> &shaders, const std::string &debugName)
  {
    GLuint program = glCreateProgram();
    for (GLuint shader : shaders)
    {
      glAttachShader(program, shader);
    }
    glLinkProgram(program);

    GLint ok = GL_FALSE;
    glGetProgramiv(program, GL_LINK_STATUS, &ok);
    if (ok == GL_FALSE)
    {
      GLint logLength = 0;
      glGetProgramiv(program, GL_INFO_LOG_LENGTH, &logLength);
      std::string log(static_cast<size_t>(std::max(0, logLength)), '\0');
      if (logLength > 0)
      {
        glGetProgramInfoLog(program, logLength, nullptr, log.data());
      }
      std::cerr << "Falha ao linkar programa '" << debugName << "':\n"
                << log << std::endl;
      glDeleteProgram(program);
      return 0;
    }

    for (GLuint shader : shaders)
    {
      glDetachShader(program, shader);
      glDeleteShader(shader);
    }
    return program;
  }

  std::string adaptManifestGlslForOpenGL(std::string glslSource, const std::vector<std::string> &pushConstantNames)
  {
    const std::regex pushBlock(R"(layout\(push_constant\)\s+uniform\s+\w+\s*\{[^\}]*\}\s*\w+\s*;)", std::regex::icase | std::regex::multiline);
    glslSource = std::regex_replace(glslSource, pushBlock, "");

    std::string uniforms;
    for (const auto &name : pushConstantNames)
    {
      uniforms += "uniform int " + name + ";\n";
      const std::string pcName = "pc." + name;
      size_t pos = 0;
      while ((pos = glslSource.find(pcName, pos)) != std::string::npos)
      {
        glslSource.replace(pos, pcName.size(), name);
        pos += name.size();
      }
    }

    const std::string versionTag = "#version";
    size_t versionPos = glslSource.find(versionTag);
    if (versionPos != std::string::npos)
    {
      size_t lineEnd = glslSource.find('\n', versionPos);
      if (lineEnd != std::string::npos)
      {
        glslSource.insert(lineEnd + 1, "\n" + uniforms + "\n");
      }
      else
      {
        glslSource += "\n" + uniforms + "\n";
      }
    }
    else
    {
      glslSource = "#version 430\n\n" + uniforms + "\n" + glslSource;
    }
    return glslSource;
  }

  bool createPresentPipeline()
  {
    static const char *vertexSrc = R"(#version 430
void main() {
  vec2 pos = vec2((gl_VertexID & 1) * 2 - 1, ((gl_VertexID >> 1) & 1) * 2 - 1);
  gl_Position = vec4(pos.x, -pos.y, 0.0, 1.0);
}
)";

    static const char *fragmentSrc = R"(#version 430
uniform sampler2D uTex;
out vec4 fragColor;
void main() {
  vec2 uv = gl_FragCoord.xy / vec2(textureSize(uTex, 0));
  fragColor = texture(uTex, uv);
}
)";

    GLuint vs = compileShader(GL_VERTEX_SHADER, vertexSrc, "present_vs");
    GLuint fs = compileShader(GL_FRAGMENT_SHADER, fragmentSrc, "present_fs");
    if (vs == 0 || fs == 0)
      return false;
    g_presentProgram = linkProgram({vs, fs}, "present_program");
    if (g_presentProgram == 0)
      return false;

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

  bool loadRuntimeManifest(const std::string &manifestPath)
  {
    const std::string jsonText = readTextFile(manifestPath);
    if (jsonText.empty())
    {
      std::cerr << "Manifesto GPU nao encontrado: " << manifestPath << std::endl;
      return false;
    }

    json manifest;
    try
    {
      manifest = json::parse(jsonText);
    }
    catch (const std::exception &ex)
    {
      std::cerr << "Falha ao parsear JSON do manifesto: " << ex.what() << std::endl;
      return false;
    }

    if (manifest.contains("buffers") && manifest["buffers"].is_array())
    {
      int binding = 0;
      for (const auto &b : manifest["buffers"])
      {
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

    if (manifest.contains("kernels") && manifest["kernels"].is_array())
    {
      for (const auto &k : manifest["kernels"])
      {
        KernelProgram kernel;
        kernel.name = k.value("name", "");
        const auto backend = k["backends"]["glsl_compute"];
        kernel.localSizeX = backend["localSize"].value("x", 1);
        kernel.localSizeY = backend["localSize"].value("y", 1);
        kernel.localSizeZ = backend["localSize"].value("z", 1);

        if (backend.contains("pushConstants") && backend["pushConstants"].is_array())
        {
          for (const auto &pc : backend["pushConstants"])
          {
            kernel.pushConstantNames.push_back(pc.value("name", ""));
          }
        }

        std::string src = backend.value("source", "");
        src = adaptManifestGlslForOpenGL(src, kernel.pushConstantNames);

        GLuint cs = compileShader(GL_COMPUTE_SHADER, src, kernel.name);
        if (cs == 0)
        {
          std::cerr << "Kernel ignorado por falha de compilacao: " << kernel.name << std::endl;
          continue;
        }
        kernel.program = linkProgram({cs}, kernel.name);
        if (kernel.program == 0)
        {
          continue;
        }

        if (backend.contains("bufferBindings") && backend["bufferBindings"].is_array())
        {
          for (const auto &binding : backend["bufferBindings"])
          {
            const std::string bufferName = binding.value("name", "");
            auto it = g_gpuBuffers.find(bufferName);
            if (it == g_gpuBuffers.end())
            {
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

  void executeDispatch(const DispatchCommand &cmd)
  {
    auto kernelIt = g_kernelPrograms.find(cmd.kernelName);
    if (kernelIt == g_kernelPrograms.end())
    {
      std::cerr << "TomGpu_Dispatch: kernel nao encontrado: " << cmd.kernelName << std::endl;
      return;
    }

    KernelProgram &kernel = kernelIt->second;
    glUseProgram(kernel.program);
    for (const auto &[_, buffer] : g_gpuBuffers)
    {
      if (buffer.ssbo != 0 && buffer.binding >= 0)
      {
        glBindBufferBase(GL_SHADER_STORAGE_BUFFER, static_cast<GLuint>(buffer.binding), buffer.ssbo);
      }
    }

    for (const std::string &pushName : kernel.pushConstantNames)
    {
      GLint location = glGetUniformLocation(kernel.program, pushName.c_str());
      if (location >= 0)
      {
        glUniform1i(location, 0);
      }
    }

    glDispatchCompute(cmd.x, cmd.y, cmd.z);
    glMemoryBarrier(GL_SHADER_STORAGE_BARRIER_BIT | GL_TEXTURE_FETCH_BARRIER_BIT);
  }

  void renderBufferToScreen(const PresentCommand& ignoredCmd) {
    // --- MODO DE EMERGÊNCIA ATIVADO ---
    // Ignoramos o comando que veio do script e forçamos os valores
    std::string bufferName = "VideoBuf";
    int w = 320;
    int h = 200;

    // Debug: Provar que a função foi chamada
    static int frameCount = 0;
    if (frameCount++ % 60 == 0) {
      std::cout << "ALIVE: Renderizando frame " << frameCount << std::endl;
    }

    auto bufferIt = g_gpuBuffers.find(bufferName);
    if (bufferIt == g_gpuBuffers.end()) {
      std::cerr << "ERRO FATAL: Buffer 'VideoBuf' sumiu!" << std::endl;
      return;
    }

    const size_t pixelCount = static_cast<size_t>(w) * static_cast<size_t>(h);
    std::vector<uint32_t> pixels(pixelCount, 0xFFFF00FF); // INICIA MAGENTA (ROXO)

    // Tenta ler da GPU
    glBindBuffer(GL_SHADER_STORAGE_BUFFER, bufferIt->second.ssbo);
    const GLsizeiptr readSize = static_cast<GLsizeiptr>(std::min(pixelCount * sizeof(uint32_t), bufferIt->second.byteSize));
    glGetBufferSubData(GL_SHADER_STORAGE_BUFFER, 0, readSize, pixels.data());
    glBindBuffer(GL_SHADER_STORAGE_BUFFER, 0);

    // DEBUG: Mostra o que veio da GPU (pixel do meio)
    if (frameCount % 60 == 0) {
      size_t mid = pixelCount / 2;
      std::cout << "GPU DIZ: Pixel[" << mid << "] = " << std::hex << pixels[mid] << std::dec << std::endl;
    }

    // --- O ULTIMATO: SOBRESCREVER TUDO COM BRANCO ---
    // Isso elimina a GPU da equação. Se a janela não ficar branca/roxa, o SDL2 está quebrado.
    // Descomente a linha abaixo para testar apenas a janela (sem GPU)
    // std::fill(pixels.begin(), pixels.end(), 0xFFFFFFFF);

    // Joga na textura
    glBindTexture(GL_TEXTURE_2D, g_presentTexture);
    glTexImage2D(GL_TEXTURE_2D, 0, GL_RGBA8, w, h, 0, GL_RGBA, GL_UNSIGNED_BYTE, pixels.data());

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

  void processPendingGpuCommands()
  {
    std::vector<DispatchCommand> dispatches;
    std::optional<PresentCommand> present;

    {
      std::lock_guard<std::mutex> lock(g_commandMutex);
      dispatches.swap(g_dispatchQueue);
      present = g_pendingPresent;
      g_pendingPresent.reset();
    }

    for (const auto &dispatch : dispatches)
    {
      executeDispatch(dispatch);
    }

    if (present.has_value())
    {
      renderBufferToScreen(*present);
    }
  }

  using TomModuleHandle =
#ifdef _WIN32
      HMODULE;
#else
      void *;
#endif

  TomModuleHandle openTomModule(const char *modulePath)
  {
#ifdef _WIN32
    return LoadLibraryA(modulePath);
#else
    return dlopen(modulePath, RTLD_NOW | RTLD_GLOBAL);
#endif
  }

  void *lookupTomSymbol(TomModuleHandle module, const char *symbol)
  {
#ifdef _WIN32
    return reinterpret_cast<void *>(GetProcAddress(module, symbol));
#else
    return dlsym(module, symbol);
#endif
  }

  std::string getTomModuleError()
  {
#ifdef _WIN32
    return "erro Win32=" + std::to_string(GetLastError());
#else
    const char *error = dlerror();
    return error ? std::string(error) : std::string("erro desconhecido");
#endif
  }

  void closeTomModule(TomModuleHandle module)
  {
#ifdef _WIN32
    if (module)
      FreeLibrary(module);
#else
    if (module)
      dlclose(module);
#endif
  }

} // namespace

extern "C" void TomGpu_Dispatch(const char *kernel_name, int32_t x, int32_t y, int32_t z)
{
  if (!g_runtimeReady.load(std::memory_order_acquire) || kernel_name == nullptr)
  {
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

extern "C" void TomGpu_Apresentar(const char *buffer_name, int32_t width, int32_t height)
{
  SDL_Delay(16); // Freio de mão: Espera ~16ms (aprox. 60 FPS) para não travar o PC
  if (!g_runtimeReady.load(std::memory_order_acquire) || buffer_name == nullptr)
  {
    return;
  }
  std::lock_guard<std::mutex> lock(g_commandMutex);
  g_pendingPresent = PresentCommand{buffer_name, width, height};
}

extern "C" void TomGpu_Present(int32_t *buffer_ptr, int32_t width, int32_t height)
{
  if (!g_runtimeReady.load(std::memory_order_acquire) || buffer_ptr == nullptr || width <= 0 || height <= 0)
  {
    return;
  }

  auto it = g_gpuBuffers.find("BufTela");
  if (it == g_gpuBuffers.end())
  {
    return;
  }

  const size_t pixelCount = static_cast<size_t>(width) * static_cast<size_t>(height);
  const size_t bytesNeeded = pixelCount * sizeof(uint32_t);
  glBindBuffer(GL_SHADER_STORAGE_BUFFER, it->second.ssbo);
  glBufferSubData(GL_SHADER_STORAGE_BUFFER, 0, static_cast<GLsizeiptr>(std::min(bytesNeeded, it->second.byteSize)), buffer_ptr);
  glBindBuffer(GL_SHADER_STORAGE_BUFFER, 0);

  TomGpu_Apresentar("BufTela", width, height);
}

extern "C" void TomGpu_LerInput(int32_t *buffer_destino)
{
  if (buffer_destino == nullptr)
  {
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

extern "C" void TomGpu_AtualizarTempo(float dt, float tempo_total)
{
  std::lock_guard<std::mutex> lock(g_timeMutex);
  g_timeState.deltaSeconds = dt;
  g_timeState.totalSeconds = tempo_total;
}

extern "C" float TomGpu_ObterDeltaTempo()
{
  std::lock_guard<std::mutex> lock(g_timeMutex);
  return g_timeState.deltaSeconds;
}

extern "C" float TomGpu_ObterTempoTotal()
{
  std::lock_guard<std::mutex> lock(g_timeMutex);
  return g_timeState.totalSeconds;
}

extern "C" void TomGpu_CarregarImagem(char *caminho, int *buffer_destino, int largura_max, int altura_max)
{
  if (caminho == nullptr || buffer_destino == nullptr || largura_max <= 0 || altura_max <= 0)
  {
    return;
  }

  int largura = 0;
  int altura = 0;
  int canais = 0;
  unsigned char *pixels = stbi_load(caminho, &largura, &altura, &canais, 4);
  if (pixels == nullptr)
  {
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

  for (int i = 0; i < pixels_copiados; ++i)
  {
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

extern "C" void TomGpu_EnfileirarAudio(float *samples, int count)
{
  if (g_audioDevice == 0 || samples == nullptr || count <= 0)
  {
    return;
  }

  const uint32_t queuedBytes = SDL_GetQueuedAudioSize(g_audioDevice);
  if (queuedBytes > kAudioMaxQueueBytes)
  {
    SDL_ClearQueuedAudio(g_audioDevice);
  }

  const uint32_t payloadBytes = static_cast<uint32_t>(count) * static_cast<uint32_t>(sizeof(float));
  if (SDL_QueueAudio(g_audioDevice, samples, payloadBytes) != 0)
  {
    std::cerr << "Falha ao enfileirar audio: " << SDL_GetError() << std::endl;
  }
}

extern "C" void TomBudgetManager_Report(char *name, int64_t cost)
{
  const std::string systemName = (name != nullptr && name[0] != '\0') ? std::string(name) : std::string("<anon>");
  const double frequency = static_cast<double>(SDL_GetPerformanceFrequency());
  const double costMs = frequency > 0.0 ? (static_cast<double>(cost) * 1000.0) / frequency : 0.0;

  std::lock_guard<std::mutex> lock(g_budgetMutex);
  auto it = g_budgetSampleIndex.find(systemName);
  if (it == g_budgetSampleIndex.end())
  {
    const size_t index = g_budgetSamples.size();
    g_budgetSamples.push_back(BudgetSample{systemName, cost, costMs});
    g_budgetSampleIndex.emplace(systemName, index);
    return;
  }

  BudgetSample &sample = g_budgetSamples[it->second];
  sample.costCycles = cost;
  sample.costMs = costMs;
}

extern "C" int32_t TomRuntime_IsCurrentThreadPCore()
{
  return isCurrentThreadOnPCore() ? 1 : 0;
}

int main(int argc, char **argv)
{
  if (argc < 2)
  {
    std::cerr << "Uso: ./tom_gpu_host <modulo_tom.(so|dll)> [manifesto.json]" << std::endl;
    return 1;
  }

  if (SDL_Init(SDL_INIT_VIDEO | SDL_INIT_AUDIO) != 0)
  {
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
  if (!g_window)
  {
    std::cerr << "Falha ao criar janela: " << SDL_GetError() << std::endl;
    SDL_Quit();
    return 1;
  }

  g_glContext = SDL_GL_CreateContext(g_window);
  if (!g_glContext)
  {
    std::cerr << "Falha ao criar contexto OpenGL: " << SDL_GetError() << std::endl;
    SDL_DestroyWindow(g_window);
    SDL_Quit();
    return 1;
  }

  SDL_GL_SetSwapInterval(1);

#ifdef TOM_GPU_USE_GLAD
  if (!gladLoadGLLoader(reinterpret_cast<GLADloadproc>(SDL_GL_GetProcAddress)))
  {
    std::cerr << "Falha ao iniciar loader OpenGL via GLAD." << std::endl;
    SDL_GL_DeleteContext(g_glContext);
    SDL_DestroyWindow(g_window);
    SDL_Quit();
    return 1;
  }
#else
  glewExperimental = GL_TRUE;
  const GLenum glewErr = glewInit();
  if (glewErr != GLEW_OK)
  {
    std::cerr << "Falha no GLEW: " << glewGetErrorString(glewErr) << std::endl;
    SDL_GL_DeleteContext(g_glContext);
    SDL_DestroyWindow(g_window);
    SDL_Quit();
    return 1;
  }
#endif

  std::cout << "OpenGL inicializado: " << glGetString(GL_VERSION) << std::endl;

  if (!createPresentPipeline())
  {
    std::cerr << "Falha ao criar pipeline de apresentacao." << std::endl;
    destroyGlResources();
    SDL_GL_DeleteContext(g_glContext);
    SDL_DestroyWindow(g_window);
    SDL_Quit();
    return 1;
  }

  const std::string manifestPath = (argc >= 3) ? argv[2] : "output.gpu.json";
  if (!loadRuntimeManifest(manifestPath))
  {
    std::cerr << "Continuando sem manifesto GPU valido (modo compatibilidade)." << std::endl;
  }

  SDL_AudioSpec desiredAudio{};
  desiredAudio.freq = kAudioSampleRate;
  desiredAudio.format = AUDIO_F32SYS;
  desiredAudio.channels = static_cast<Uint8>(kAudioChannels);
  desiredAudio.samples = 1024;
  desiredAudio.callback = nullptr;

  g_audioDevice = SDL_OpenAudioDevice(nullptr, 0, &desiredAudio, &g_audioSpec, 0);
  if (g_audioDevice == 0)
  {
    std::cerr << "Falha ao abrir dispositivo de audio: " << SDL_GetError() << std::endl;
  }
  else
  {
    SDL_PauseAudioDevice(g_audioDevice, 0);
  }

  TomModuleHandle handle = openTomModule(argv[1]);
  if (!handle)
  {
    std::cerr << "Falha ao abrir modulo: " << getTomModuleError() << std::endl;
    destroyGlResources();
    SDL_GL_DeleteContext(g_glContext);
    SDL_DestroyWindow(g_window);
    SDL_Quit();
    return 1;
  }

  using TomMainFn = int (*)();
  auto *tomMain = reinterpret_cast<TomMainFn>(lookupTomSymbol(handle, "main"));
  if (!tomMain)
  {
    std::cerr << "Simbolo 'main' nao encontrado no modulo Tom." << std::endl;
    closeTomModule(handle);
    destroyGlResources();
    SDL_GL_DeleteContext(g_glContext);
    SDL_DestroyWindow(g_window);
    SDL_Quit();
    return 1;
  }

  g_runtimeReady.store(true, std::memory_order_release);

  std::thread tomThread([tomMain]()
                        { tomMain(); });
  tomThread.detach();

  uint64_t previousCounter = SDL_GetPerformanceCounter();
  float totalSeconds = 0.0f;
  bool running = true;

  while (running)
  {
    const uint64_t currentCounter = SDL_GetPerformanceCounter();
    const uint64_t counterDelta = currentCounter - previousCounter;
    previousCounter = currentCounter;
    const double freq = static_cast<double>(SDL_GetPerformanceFrequency());
    const float dt = static_cast<float>(freq > 0.0 ? static_cast<double>(counterDelta) / freq : 0.0);
    totalSeconds += std::max(0.0f, dt);
    TomGpu_AtualizarTempo(dt, totalSeconds);

    SDL_Event event;
    while (SDL_PollEvent(&event))
    {
      if (event.type == SDL_QUIT)
      {
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

      const Uint8 *keys = SDL_GetKeyboardState(nullptr);
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

  if (g_audioDevice != 0)
  {
    SDL_ClearQueuedAudio(g_audioDevice);
    SDL_CloseAudioDevice(g_audioDevice);
    g_audioDevice = 0;
  }

  closeTomModule(handle);
  destroyGlResources();

  if (g_glContext)
  {
    SDL_GL_DeleteContext(g_glContext);
    g_glContext = nullptr;
  }
  if (g_window)
  {
    SDL_DestroyWindow(g_window);
    g_window = nullptr;
  }

  SDL_Quit();
  return 0;
}
