cmake_minimum_required(VERSION 3.15)
project(logilinux-ffi VERSION 1.0.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_POSITION_INDEPENDENT_CODE ON)

add_subdirectory(${CMAKE_CURRENT_SOURCE_DIR}/../ref/logilinux/lib ${CMAKE_CURRENT_BINARY_DIR}/logilinux)

add_library(logilinux-ffi SHARED
    src/logilinux_ffi.cpp
)

target_include_directories(logilinux-ffi
    PUBLIC
    $<BUILD_INTERFACE:${CMAKE_CURRENT_SOURCE_DIR}/include>
    $<INSTALL_INTERFACE:include>
    PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}/../ref/logilinux/lib/src
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
