cmake_minimum_required(VERSION 3.15)
project(logilinux-ffi VERSION 1.0.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_POSITION_INDEPENDENT_CODE ON)

# Include FetchContent for downloading logilinux
include(FetchContent)

# Fetch logilinux library from GitHub
FetchContent_Declare(
    logilinux
    GIT_REPOSITORY https://github.com/ron0studios/logilinux.git
    GIT_TAG master
    SOURCE_SUBDIR lib
)

FetchContent_MakeAvailable(logilinux)

# Create the FFI wrapper library
add_library(logilinux-ffi SHARED
    src/logilinux_ffi.cpp
)

target_include_directories(logilinux-ffi
    PUBLIC
    $<BUILD_INTERFACE:${CMAKE_CURRENT_SOURCE_DIR}/include>
    $<INSTALL_INTERFACE:include>
    PRIVATE
    ${logilinux_SOURCE_DIR}/lib/src
)

target_link_libraries(logilinux-ffi
    PRIVATE
    logilinux
)

# Installation rules
install(TARGETS logilinux-ffi
    LIBRARY DESTINATION lib
    ARCHIVE DESTINATION lib
    RUNTIME DESTINATION bin
)

install(DIRECTORY include/
    DESTINATION include
)
