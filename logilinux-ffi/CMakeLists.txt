cmake_minimum_required(VERSION 3.15)
project(logilinux-ffi VERSION 1.0.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_POSITION_INDEPENDENT_CODE ON)

# Use the local SDK checkout when available so local driver fixes are included.
# Fall back to GitHub for clean checkouts without the sibling SDK repository.
include(FetchContent)
set(LOCAL_LOGILINUX_DIR "${CMAKE_CURRENT_SOURCE_DIR}/../../logilinux-sdk/logilinux-driver")
if(EXISTS "${LOCAL_LOGILINUX_DIR}/lib/CMakeLists.txt")
    message(STATUS "Using local LogiLinux SDK: ${LOCAL_LOGILINUX_DIR}")
    FetchContent_Declare(
        logilinux
        SOURCE_DIR "${LOCAL_LOGILINUX_DIR}"
        SOURCE_SUBDIR lib
    )
else()
    message(STATUS "Local LogiLinux SDK not found; fetching from GitHub")
    FetchContent_Declare(
        logilinux
        GIT_REPOSITORY https://github.com/HaruKaiTTV/logilinux.git
        GIT_TAG master
        SOURCE_SUBDIR lib
    )
endif()
FetchContent_MakeAvailable(logilinux)

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
