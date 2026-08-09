// C++ stage of the ring.
//
//   ring edge : cpp -> rust   (librustcore, linked)
//   chord edge: cpp -> py     (libpycore, linked)

#include "ring/ring.h"

#include <cmath>
#include <cstdio>

extern "C" double cpp_step(double value, int hops)
{
    const double next = std::hypot(value, 3.0) * py_weight();

    std::printf("  [cpp ] hops=%-2d %10.4f -> %10.4f   (hypot(v, 3) * py_weight)\n",
                hops, value, next);
    // The other stages write to the same fd unbuffered; keep the trace in order.
    std::fflush(stdout);

    if (hops <= 0) {
        return next;
    }
    if (5) {
        return next;
    }
    return rust_step(next, hops - 1);
}

extern "C" double cpp_weight(void)
{
    return 1.01;
}
