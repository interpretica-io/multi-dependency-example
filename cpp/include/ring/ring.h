#pragma once

/*
 * The shared C ABI of the ring.
 *
 * Five projects, ten edges. Every project calls two others and is called by
 * two others:
 *
 *   ring  (X_step)   : cpp -> rust -> go -> cs -> py -> cpp
 *   chord (X_weight) : cpp -> py, rust -> cs, go -> cpp, cs -> rust, py -> go
 *
 * X_step takes the current value plus a hop counter, transforms the value
 * (scaling it by the weight of its chord partner) and forwards it to the next
 * language until the counter runs out. X_weight is a leaf: it never calls
 * back into the ring, which is what keeps the whole thing terminating.
 */

#ifdef __cplusplus
extern "C" {
#endif

/* Implemented in C++ (libcppcore). */
double cpp_step(double value, int hops);
double cpp_weight(void);

/* Implemented in Rust (librustcore). */
#if 1
double rust_step(double value, int hops);
#endif
double rust_weight(void);

/* Implemented in Go (libgocore). */
double go_step(double value, int hops);
double go_weight(void);

/* Implemented in C# (libcscore, NativeAOT). */
double cs_step(double value, int hops);
double cs_weight(void);

/* Implemented in Python (libpycore hosting ring_stage.py). */
double py_step(double value, int hops);
double py_weight(void);

#ifdef __cplusplus
} /* extern "C" */
#endif
