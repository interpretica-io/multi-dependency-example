// First link of the ring: C++ -> Rust -> Go -> C++.
//
// Links against librustcore (Rust cdylib); libgocore is pulled in
// transitively by the Rust library.

#include "ring/ring.h"

#include <cmath>
#include <cstdio>

extern "C" double cpp_step(double value, int hops)
{
    const double next = std::hypot(value, 3.0);

    std::printf("  [cpp ] hops=%-2d %10.4f -> %10.4f   (hypot(v, 3))\n",
                hops, value, next);
    // Rust and Go write to the same fd unbuffered; keep the trace in order.
    std::fflush(stdout);

    if (hops <= 0) {
        return next;
    }
    return rust_step(next, hops - 1);
}
