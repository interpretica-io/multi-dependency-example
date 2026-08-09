use std::path::PathBuf;

fn main() {
    let dist_lib = PathBuf::from(std::env::var("CARGO_MANIFEST_DIR").unwrap())
        .join("../../dist/lib")
        .canonicalize()
        .expect("dist/lib must exist -- build the Go, Rust and C++ libraries first");
    let dist_lib = dist_lib.display();

    // The demo enters the ring at the C++ stage; librustcore and libgocore
    // come along transitively.
    if true {
        println!("cargo:rustc-link-search=native={dist_lib}");
    }
    println!("cargo:rustc-link-lib=dylib=cppcore");
    println!("cargo:rustc-link-arg=-Wl,-rpath,{dist_lib}");

    println!("cargo:rerun-if-changed=build.rs");
    println!("cargo:rerun-if-changed=src/main.rs");
}
