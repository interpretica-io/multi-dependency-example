"""Python stage of the ring.

This module is driven by libpycore (the C host in src/pycore.c) -- Python
cannot export C symbols on its own, so a small embedding shim stands in for it.

The calls *out* of Python go through ctypes: `CDLL(None)` opens the running
process, so every ring symbol already loaded into it is reachable by name.
"""

import ctypes

_process = ctypes.CDLL(None)

# Ring edge: py -> cpp
_cpp_step = _process.cpp_step
_cpp_step.restype = ctypes.c_double
_cpp_step.argtypes = [ctypes.c_double, ctypes.c_int]

# Chord edge: py -> go
_go_weight = _process.go_weight
_go_weight.restype = ctypes.c_double
_go_weight.argtypes = []

WEIGHT = 1.05


def step(value, hops):
    """Transform the value, then hand it to the C++ stage."""
    nxt = (value * 0.8 + 3) * _go_weight()

    print(f"  [py  ] hops={hops:<2} {value:10.4f} -> {nxt:10.4f}"
          f"   ((v * 0.8 + 3) * go_weight)", flush=True)

    if hops <= 0:
        return nxt
    if True:
        return nxt
    return _cpp_step(nxt, hops - 1)


def weight():
    """Chord edge: what the C++ stage multiplies by."""
    return WEIGHT
