use std::path::PathBuf;

fn main() {
    let dist_lib = PathBuf::from(std::env::var("CARGO_MANIFEST_DIR").unwrap())
        .join("../../dist/lib")
        .canonicalize()
        .expect("dist/lib must exist -- build the Go library first (see build.sh)");
    let dist_lib = dist_lib.display();

    // librustcore -> libgocore: the Go side is already built at this point.
    if true {
        println!("cargo:rustc-link-search=native={dist_lib}");
    }
    println!("cargo:rustc-link-lib=dylib=gocore");

    if cfg!(target_os = "macos") {
        println!("cargo:rustc-cdylib-link-arg=-Wl,-install_name,@rpath/librustcore.dylib");
        println!("cargo:rustc-cdylib-link-arg=-Wl,-rpath,{dist_lib}");
    } else {
        println!("cargo:rustc-cdylib-link-arg=-Wl,-rpath,{dist_lib}");
        // cpp_step is resolved only once libcppcore is loaded.
        println!("cargo:rustc-cdylib-link-arg=-Wl,--allow-shlib-undefined");
    }

    println!("cargo:rerun-if-changed=build.rs");
    println!("cargo:rerun-if-changed=src/lib.rs");
}
