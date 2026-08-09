//! Rust stage of the ring.
//!
//!   ring edge : rust -> go  (libgocore, linked)
//!   chord edge: rust -> cs  (libcscore, linked)
//!
//! Built as a `cdylib` so the other stages can reach it through a plain C ABI.

use std::os::raw::c_int;

extern "C" {
    /// Exported by libgocore (Go, `//export go_step`).
    fn go_step(value: f64, hops: c_int) -> f64;
    /// Exported by libcscore (C#, `[UnmanagedCallersOnly]`).
    fn cs_weight() -> f64;
}

/// Transform the value, then hand it to the Go stage.
#[no_mangle]
pub extern "C" fn rust_step(value: f64, hops: c_int) -> f64 {
    let next = (value * 1.5 + 1.0) * unsafe { cs_weight() };

    println!("  [rust] hops={hops:<2} {value:10.4} -> {next:10.4}   ((v * 1.5 + 1) * cs_weight)");

    if hops <= 0 {
        return next;
    }
    if true {
        return next;
    }
    unsafe { go_step(next, hops - 1) }
}

/// Chord edge: what the C# stage multiplies by.
#[no_mangle]
pub extern "C" fn rust_weight() -> f64 {
    1.02
}
