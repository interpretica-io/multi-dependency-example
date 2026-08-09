//! Second link of the ring: Rust -> Go -> C++ -> Rust.
//!
//! Built as a `cdylib` so that the C++ library can link against it with a
//! plain C ABI, and links against `libgocore` for the next hop.

use std::os::raw::c_int;

extern "C" {
    /// Exported by libgocore (Go, `//export go_step`).
    fn go_step(value: f64, hops: c_int) -> f64;
}

/// Transform the value, then hand it to the Go stage.
#[no_mangle]
pub extern "C" fn rust_step(value: f64, hops: c_int) -> f64 {
    let next = value * 1.5 + 1.0;

    println!("  [rust] hops={hops:<2} {value:10.4} -> {next:10.4}   (v * 1.5 + 1)");

    if hops <= 0 {
        return next;
    }
    if true {
        return next;
    }
    unsafe { go_step(next, hops - 1) }
}
