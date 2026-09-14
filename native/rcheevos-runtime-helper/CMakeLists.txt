cmake_minimum_required(VERSION 3.24)

project(ra_runtime_helper VERSION 0.1.0 LANGUAGES C)

set(CMAKE_C_STANDARD 99)
set(CMAKE_C_STANDARD_REQUIRED ON)
set(CMAKE_C_EXTENSIONS OFF)

include(FetchContent)
if(POLICY CMP0169)
  cmake_policy(SET CMP0169 OLD)
endif()

# RetroAchievements/rcheevos v12.5.0. Pin the immutable commit, not merely the tag.
set(RCHEEVOS_COMMIT "1433173220a7eaede6a9ed7a18e94117be1821e0")
FetchContent_Declare(
  rcheevos
  GIT_REPOSITORY https://github.com/RetroAchievements/rcheevos.git
  GIT_TAG ${RCHEEVOS_COMMIT}
  GIT_SHALLOW FALSE
  GIT_PROGRESS TRUE
)
FetchContent_GetProperties(rcheevos)
if(NOT rcheevos_POPULATED)
  FetchContent_Populate(rcheevos)
endif()

set(RC_ROOT "${rcheevos_SOURCE_DIR}")
set(RC_RUNTIME_SOURCES
  "${RC_ROOT}/src/rcheevos/alloc.c"
  "${RC_ROOT}/src/rcheevos/condition.c"
  "${RC_ROOT}/src/rcheevos/condset.c"
  "${RC_ROOT}/src/rcheevos/consoleinfo.c"
  "${RC_ROOT}/src/rcheevos/format.c"
  "${RC_ROOT}/src/rcheevos/lboard.c"
  "${RC_ROOT}/src/rcheevos/memref.c"
  "${RC_ROOT}/src/rcheevos/operand.c"
  "${RC_ROOT}/src/rcheevos/rc_validate.c"
  "${RC_ROOT}/src/rcheevos/richpresence.c"
  "${RC_ROOT}/src/rcheevos/runtime.c"
  "${RC_ROOT}/src/rcheevos/runtime_progress.c"
  "${RC_ROOT}/src/rcheevos/trigger.c"
  "${RC_ROOT}/src/rcheevos/value.c"
  "${RC_ROOT}/src/rc_compat.c"
  "${RC_ROOT}/src/rc_util.c"
  "${RC_ROOT}/src/rc_version.c"
  "${RC_ROOT}/src/rhash/md5.c"
)

add_library(rcheevos_runtime STATIC ${RC_RUNTIME_SOURCES})
target_include_directories(rcheevos_runtime
  PUBLIC "${RC_ROOT}/include"
  PRIVATE
    "${RC_ROOT}/src"
    "${RC_ROOT}/src/rcheevos"
    "${RC_ROOT}/src/rhash"
)

if(MSVC)
  target_compile_definitions(rcheevos_runtime PRIVATE _CRT_SECURE_NO_WARNINGS)
  target_compile_options(rcheevos_runtime PRIVATE /W3)
else()
  target_compile_options(rcheevos_runtime PRIVATE -Wall -Wextra)
endif()

add_executable(ra-runtime-helper main.c)
target_include_directories(ra-runtime-helper PRIVATE
  "${RC_ROOT}/include"
  "${RC_ROOT}/src"
)
target_compile_definitions(ra-runtime-helper PRIVATE RA_RCHEEVOS_TAG="v12.5.0")
target_link_libraries(ra-runtime-helper PRIVATE rcheevos_runtime)

if(MSVC)
  target_compile_definitions(ra-runtime-helper PRIVATE _CRT_SECURE_NO_WARNINGS)
  target_compile_options(ra-runtime-helper PRIVATE /W4)
else()
  target_compile_options(ra-runtime-helper PRIVATE -Wall -Wextra -Wpedantic)
endif()
