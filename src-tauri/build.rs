use std::env;
use std::path::PathBuf;

fn main() {
    tauri_build::build();

    let manifest_dir = PathBuf::from(env::var("CARGO_MANIFEST_DIR").unwrap());
    let ffi_dir = manifest_dir.parent().unwrap().join("logilinux-ffi");
    let ffi_build_dir = ffi_dir.join("build");

    let dst = cmake::Config::new(&ffi_dir)
        .define("CMAKE_BUILD_TYPE", "Release")
        .build();

    println!("cargo:rustc-link-search=native={}/lib", dst.display());
    println!("cargo:rustc-link-lib=dylib=logilinux-ffi");
    println!("cargo:rustc-link-lib=dylib=logilinux");

    println!("cargo:rustc-link-search=native={}", ffi_build_dir.display());

    println!("cargo:rerun-if-changed=../logilinux-ffi/src/logilinux_ffi.cpp");
    println!("cargo:rerun-if-changed=../logilinux-ffi/include/logilinux_ffi.h");

    let bindings = bindgen::Builder::default()
        .header(ffi_dir.join("include/logilinux_ffi.h").to_str().unwrap())
        .parse_callbacks(Box::new(bindgen::CargoCallbacks::new()))
        .allowlist_function("logilinux_.*")
        .allowlist_type("Device.*")
        .allowlist_type("Event.*")
        .allowlist_type("Rotation.*")
        .allowlist_type("Button.*")
        .allowlist_type("LogiLinux.*")
        .allowlist_type("Capability.*")
        .generate()
        .expect("Unable to generate bindings");

    let out_path = PathBuf::from(env::var("OUT_DIR").unwrap());
    bindings
        .write_to_file(out_path.join("logilinux_bindings.rs"))
        .expect("Couldn't write bindings!");
}
