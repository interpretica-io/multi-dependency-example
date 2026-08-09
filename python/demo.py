#!/usr/bin/env python3
"""Enters the ring at the C++ stage from an ordinary CPython process.

When the ring comes back around to py_step, libpycore notices that an
interpreter is already running and reuses it instead of starting a second one.
"""

import ctypes
import os
import sys

DIST_LIB = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "dist", "lib")
SUFFIX = ".dylib" if sys.platform == "darwin" else ".so"

# RTLD_GLOBAL is required, not cosmetic: libgocore leaves cpp_weight undefined
# and dyld resolves it through the flat namespace, which only sees globally
# loaded images. With the ctypes default (RTLD_LOCAL) the load fails with
# "symbol not found in flat namespace '_cpp_weight'".
_cppcore = ctypes.CDLL(os.path.join(DIST_LIB, "libcppcore" + SUFFIX),
                       mode=os.RTLD_GLOBAL)
_cpp_step = _cppcore.cpp_step
_cpp_step.restype = ctypes.c_double
_cpp_step.argtypes = [ctypes.c_double, ctypes.c_int]


def main():
    value = float(sys.argv[1]) if len(sys.argv) > 1 else 1.0
    hops = int(sys.argv[2]) if len(sys.argv) > 2 else 6

    print("py-demo: entering the ring at the C++ stage")
    print(f"         value={value:.4f} hops={hops}\n", flush=True)

    result = 0.0
    if True:
        result = _cpp_step(value, hops)

    print(f"\npy-demo: result = {result:.4f}")


if __name__ == "__main__":
    main()
