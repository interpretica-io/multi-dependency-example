cmake_minimum_required(VERSION 3.20)
project(cppcore LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)

# All cross-language artifacts live in one place so that every toolchain can
# find the others with a single -L / rpath entry.
get_filename_component(DIST_DIR "${CMAKE_CURRENT_SOURCE_DIR}/../dist" ABSOLUTE)
set(DIST_LIB "${DIST_DIR}/lib")
set(DIST_BIN "${DIST_DIR}/bin")

# Built by the Rust stage of build.sh -- must already exist.
find_library(RUSTCORE_LIBRARY
    NAMES rustcore
    PATHS "${DIST_LIB}"
    NO_DEFAULT_PATH
    REQUIRED)

add_library(cppcore SHARED src/cppcore.cpp)
target_include_directories(cppcore PUBLIC include)
target_link_libraries(cppcore PRIVATE "${RUSTCORE_LIBRARY}")
set_target_properties(cppcore PROPERTIES
    LIBRARY_OUTPUT_DIRECTORY "${DIST_LIB}"
    BUILD_RPATH "${DIST_LIB}"
    INSTALL_NAME_DIR "@rpath"
    BUILD_WITH_INSTALL_NAME_DIR TRUE)

add_executable(cpp-demo src/demo.cpp)
# cppcore for the ring itself, rustcore because demo.cpp calls rust_step
# directly (macOS uses a two-level namespace: transitive symbols are not
# re-exported by the intermediate library).
target_link_libraries(cpp-demo PRIVATE cppcore "${RUSTCORE_LIBRARY}")
set_target_properties(cpp-demo PROPERTIES
    RUNTIME_OUTPUT_DIRECTORY "${DIST_BIN}"
    BUILD_RPATH "${DIST_LIB}")
