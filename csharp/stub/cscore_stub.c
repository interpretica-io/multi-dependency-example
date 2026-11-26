/*
 * Stand-in for the C# stage of the ring.
 *
 * Built instead of `csharp/cscore.csproj` when RING_SKIP_CSHARP=1, producing a
 * libcscore with the same two exports and the same arithmetic. Everything
 * downstream — Go's cgo call, `rustcore`'s `-lcscore`, the C++ header — links
 * against it unchanged, so skipping C# costs one build stage rather than edits
 * in three other languages.
 *
 * Why anyone would: the analyzer needs `visao-roslyn-helper` to read C#, and a
 * distribution built without it cannot see this stage at all. Rather than let
 * the whole ring fail to build over one absent binary, swap the stage out and
 * keep the cycle closed — with the honest consequence that the graph then has
 * a C stage where the C# one belongs.
 *
 * `rust_weight` is resolved at run time rather than linked, exactly as
 * RingStage.cs resolves it: librustcore is stage 4 and does not exist yet when
 * this is compiled in stage 2. dlsym against the whole process finds it once
 * everything is loaded.
 */

#include <dlfcn.h>
#include <stdio.h>

typedef double (*weight_fn)(void);
typedef double (*step_fn)(double, int);

/* Mirrors RingStage.Weight(). */
double cs_weight(void)
{
    return 1.04;
}

/* Mirrors RingStage.Step(): (v + 2) * rust_weight, then the ring edge to
 * py_step until the hop counter is spent. */
double cs_step(double value, int hops)
{
    static weight_fn rust_weight;
    static step_fn py_step;
    double next;

    if (rust_weight == NULL)
        rust_weight = (weight_fn)dlsym(RTLD_DEFAULT, "rust_weight");
    if (py_step == NULL)
        py_step = (step_fn)dlsym(RTLD_DEFAULT, "py_step");

    next = (value + 2.0) * (rust_weight != NULL ? rust_weight() : 1.0);

    printf("  [cs* ] hops=%-2d %10.4f -> %10.4f   ((v + 2) * rust_weight)\n",
           hops, value, next);
    fflush(stdout);

    if (hops <= 0 || py_step == NULL)
        return next;
    return py_step(next, hops - 1);
}
