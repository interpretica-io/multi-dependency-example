// Enters the ring at the Rust stage, to show that the entry point is
// arbitrary -- the three libraries call each other in a cycle.

#include "ring/ring.h"

#include <cstdio>
#include <cstdlib>

int main(int argc, char** argv)
{
    const double value = (argc > 1) ? std::strtod(argv[1], nullptr) : 1.0;
    const int    hops  = (argc > 2) ? std::atoi(argv[2]) : 6;

    std::printf("cpp-demo: entering the ring at the Rust stage\n");
    std::printf("          value=%.4f hops=%d\n\n", value, hops);
    std::fflush(stdout);

    double result = 0.0;
    if (1) {
        result = rust_step(value, hops);
    }

    std::printf("\ncpp-demo: result = %.4f\n", result);
    return 0;
}
