CXX ?= g++
CLANG ?= clang
BUILD_DIR ?= build
HOST_SRC := tom_gpu_host.cpp
HOST_BIN := $(BUILD_DIR)/tom_gpu_host
GL_LOADER ?= glew
GLAD_SRC ?= third_party/glad/src/glad.c
GLAD_INCLUDE ?= third_party/glad/include
MODULE_INPUT ?=
CXXFLAGS_COMMON := -std=c++17 -O2 -fPIC

ifeq ($(OS),Windows_NT)
HOST_BIN := $(BUILD_DIR)/tom_gpu_host.exe
SHARED_EXT := dll
MODULE_LDFLAGS := -shared
MODULE_HOST_LIB := $(BUILD_DIR)/libtomhost.a
HOST_LDFLAGS := -Wl,--export-all-symbols -Wl,--out-implib,$(BUILD_DIR)/libtomhost.a
SDL_CFLAGS ?=
SDL_LIBS ?= -lmingw32 -lSDL2main -lSDL2
OPENGL_LIBS := -lopengl32
SYS_LIBS :=
GLEW_LIBS := -lglew32
else
SHARED_EXT := so
MODULE_LDFLAGS := -shared -fPIC
MODULE_HOST_LIB :=
HOST_LDFLAGS := -rdynamic
SDL_CFLAGS ?= $(shell pkg-config --cflags sdl2 2>/dev/null)
SDL_LIBS ?= $(shell pkg-config --libs sdl2 2>/dev/null)
OPENGL_LIBS := -lGL
SYS_LIBS := -ldl -pthread
GLEW_LIBS := -lGLEW
endif

MODULE_OUT ?= $(BUILD_DIR)/module.$(SHARED_EXT)

ifeq ($(GL_LOADER),glad)
GL_LOADER_DEFINE := -DTOM_GPU_USE_GLAD
GL_LOADER_SRC := $(GLAD_SRC)
GL_LOADER_INC := -I$(GLAD_INCLUDE)
GL_LOADER_LIBS :=
else
GL_LOADER_DEFINE :=
GL_LOADER_SRC :=
GL_LOADER_INC :=
GL_LOADER_LIBS := $(GLEW_LIBS)
endif

HOST_CXXFLAGS := $(CXXFLAGS_COMMON) $(CXXFLAGS) $(SDL_CFLAGS) $(GL_LOADER_DEFINE) $(GL_LOADER_INC)
HOST_LIBS := $(SDL_LIBS) $(OPENGL_LIBS) $(GL_LOADER_LIBS) $(SYS_LIBS)

.PHONY: all host module clean print-config
all: host

$(BUILD_DIR):
	mkdir -p "$(BUILD_DIR)"

host: $(HOST_BIN)

$(HOST_BIN): $(HOST_SRC) stb_image.h $(GL_LOADER_SRC) | $(BUILD_DIR)
	$(CXX) $(HOST_CXXFLAGS) $(HOST_SRC) $(GL_LOADER_SRC) -o "$(HOST_BIN)" $(HOST_LDFLAGS) $(HOST_LIBS)

module:
	@test -n "$(MODULE_INPUT)" || { echo "Defina MODULE_INPUT com o LLVM experimental a compilar." >&2; exit 1; }
	@mkdir -p "$(dir $(MODULE_OUT))"
	$(CLANG) $(MODULE_LDFLAGS) "$(MODULE_INPUT)" $(MODULE_HOST_LIB) -o "$(MODULE_OUT)"

print-config:
	@printf 'HOST_BIN=%s\nMODULE_INPUT=%s\nMODULE_OUT=%s\nCLANG=%s\n' "$(HOST_BIN)" "$(MODULE_INPUT)" "$(MODULE_OUT)" "$(CLANG)"

clean:
	rm -f "$(HOST_BIN)" "$(BUILD_DIR)/libtomhost.a" "$(BUILD_DIR)/module.so" "$(BUILD_DIR)/module.dll"
