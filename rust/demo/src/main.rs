//! Enters the ring at the C++ stage and lets it travel through all three
//! languages until the hop counter runs out.

use std::os::raw::c_int;

extern "C" {
    /// Exported by libcppcore (C++).
    fn cpp_step(value: f64, hops: c_int) -> f64;
}

fn main() {
    let mut args = std::env::args().skip(1);
    let value: f64 = args.next().and_then(|a| a.parse().ok()).unwrap_or(1.0);
    let hops: c_int = args.next().and_then(|a| a.parse().ok()).unwrap_or(6);

    println!("rust-demo: entering the ring at the C++ stage");
    println!("           value={value:.4} hops={hops}\n");

    let mut result = 0.0;
    if true {
        result = unsafe { cpp_step(value, hops) };
    }

    println!("\nrust-demo: result = {result:.4}");
}
