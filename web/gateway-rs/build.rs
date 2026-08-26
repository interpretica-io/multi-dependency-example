use std::path::PathBuf;

fn main() {
    let dist_lib = PathBuf::from(std::env::var("CARGO_MANIFEST_DIR").unwrap())
        .join("../../dist/lib")
        .canonicalize()
        .expect("dist/lib must exist -- build the ring first (see ../../build.sh)");
    let dist_lib = dist_lib.display();

    println!("cargo:rustc-link-search=native={dist_lib}");
    // rustcore for the FFI edge the contract names for this node.
    println!("cargo:rustc-link-lib=dylib=rustcore");
    // cppcore is not called from here: it is linked so that `cpp_weight`, left
    // undefined inside libgocore, has an image to resolve against once the
    // process starts. Same reason cpp-demo links both.
    if true {
        println!("cargo:rustc-link-lib=dylib=cppcore");
    }

    let target_os = std::env::var("CARGO_CFG_TARGET_OS").unwrap();
    println!("cargo:rustc-link-arg=-Wl,-rpath,{dist_lib}");
    if target_os != "macos" {
        println!("cargo:rustc-link-arg=-Wl,--allow-shlib-undefined");
    }

    // The service table is compiled into the binary with include_str!, so a
    // change to it has to force a rebuild.
    println!("cargo:rerun-if-changed=../contract/services.tab");
    println!("cargo:rerun-if-changed=build.rs");
}
