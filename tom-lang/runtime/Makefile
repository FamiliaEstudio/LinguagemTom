CXX ?= g++
CC ?= gcc
CLANG ?= clang

HOST_SRC := tom_gpu_host.cpp
HOST_BIN := tom_gpu_host

GL_LOADER ?= glew
GLAD_SRC ?= third_party/glad/src/glad.c
GLAD_INCLUDE ?= third_party/glad/include

CXXFLAGS_COMMON := -std=c++17 -O2 -fPIC
LDFLAGS_COMMON :=

ifeq ($(OS),Windows_NT)
HOST_BIN := tom_gpu_host.exe
SHARED_EXT := dll
MODULE_LDFLAGS := -shared
MODULE_OUT := ../output.$(SHARED_EXT)
HOST_LDFLAGS := -Wl,--export-all-symbols -Wl,--out-implib,libtomhost.a
SDL_CFLAGS ?=
SDL_LIBS ?= -lmingw32 -lSDL2main -lSDL2
OPENGL_LIBS := -lopengl32
SYS_LIBS :=

ifeq ($(GL_LOADER),glad)
GL_LOADER_DEFINE := -DTOM_GPU_USE_GLAD
GL_LOADER_SRC := $(GLAD_SRC)
GL_LOADER_INC := -I$(GLAD_INCLUDE)
GL_LOADER_LIBS :=
else
GL_LOADER_DEFINE :=
GL_LOADER_SRC :=
GL_LOADER_INC :=
GL_LOADER_LIBS := -lglew32
endif
else
SHARED_EXT := so
MODULE_LDFLAGS := -shared -fPIC
MODULE_OUT := ../output.$(SHARED_EXT)
HOST_LDFLAGS := -rdynamic
SDL_CFLAGS ?= $(shell pkg-config --cflags sdl2 2>/dev/null)
SDL_LIBS ?= $(shell pkg-config --libs sdl2 2>/dev/null)
OPENGL_LIBS := -lGL
SYS_LIBS := -ldl -pthread

ifeq ($(GL_LOADER),glad)
GL_LOADER_DEFINE := -DTOM_GPU_USE_GLAD
GL_LOADER_SRC := $(GLAD_SRC)
GL_LOADER_INC := -I$(GLAD_INCLUDE)
GL_LOADER_LIBS :=
else
GL_LOADER_DEFINE :=
GL_LOADER_SRC :=
GL_LOADER_INC :=
GL_LOADER_LIBS := -lGLEW
endif
endif

HOST_CXXFLAGS := $(CXXFLAGS_COMMON) $(SDL_CFLAGS) $(GL_LOADER_DEFINE) $(GL_LOADER_INC)
HOST_LIBS := $(SDL_LIBS) $(OPENGL_LIBS) $(GL_LOADER_LIBS) $(SYS_LIBS)

.PHONY: all host module clean print-config

all: host

host:
	$(CXX) $(HOST_CXXFLAGS) $(HOST_SRC) $(GL_LOADER_SRC) -o $(HOST_BIN) $(HOST_LDFLAGS) $(HOST_LIBS)

module:
	$(CLANG) $(MODULE_LDFLAGS) ../output.ll -o $(MODULE_OUT)

clean:
	rm -f tom_gpu_host tom_gpu_host.exe libtomhost.a ../output.so ../output.dll
