#pragma once

/*
 * The shared C ABI of the ring. Every stage takes the current value plus a
 * hop counter, transforms the value and -- unless the counter is exhausted --
 * forwards it to the next language.
 *
 *      cpp_step  --> rust_step --> go_step --> cpp_step --> ...
 */

#ifdef __cplusplus
extern "C" {
#endif

/* Implemented in C++ (libcppcore). */
double cpp_step(double value, int hops);

/* Implemented in Rust (librustcore). */
double rust_step(double value, int hops);

/* Implemented in Go (libgocore). */
double go_step(double value, int hops);

#ifdef __cplusplus
} /* extern "C" */
#endif
