#!/usr/bin/env python3
"""Probe every node of the web tier.

Reads the same web/contract/services.tab the three services were built from --
the fourth reader of that file, and the only one that parses it at runtime with
no build step in between -- then GETs each node in turn.

It also imports python/ring_stage.py, so the weight of the Python stage comes
from the ring's own source instead of from a copy of the number. That import
only works once libcppcore is loaded with RTLD_GLOBAL (see python/demo.py for
why), which makes this script depend on dist/lib as well.

    python3 web/tools/probe.py                 # every node
    python3 web/tools/probe.py gateway-rs 2.5 4
"""

import ctypes
import os
import pathlib
import sys
import urllib.error
import urllib.request

REPO = pathlib.Path(__file__).resolve().parents[2]
CONTRACT = REPO / "web" / "contract" / "services.tab"
DIST_LIB = REPO / "dist" / "lib"
SUFFIX = ".dylib" if sys.platform == "darwin" else ".so"


def load_ring():
    """Make the ring's symbols visible, then import its Python stage.

    Returns the ring_stage module, or None if the ring has not been built.
    """
    try:
        ctypes.CDLL(str(DIST_LIB / ("libcppcore" + SUFFIX)), mode=os.RTLD_GLOBAL)
    except OSError as exc:
        print(f"note: ring not loaded ({exc}); py_weight unavailable\n")
        return None

    sys.path.insert(0, str(REPO / "python"))
    import ring_stage

    return ring_stage


def load_contract(path=CONTRACT):
    """name -> (port, upstream, ring_lib, ring_symbol)."""
    services = {}

    for raw in path.read_text().splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue

        cols = line.split()
        if len(cols) < 5:
            raise ValueError(f"malformed contract line: {line}")

        name, port, upstream, ring_lib, ring_symbol = cols[:5]
        services[name] = (int(port), upstream, ring_lib, ring_symbol)

    return services


def probe(port, value, hops):
    url = f"http://127.0.0.1:{port}/ring?value={value}&hops={hops}"
    try:
        with urllib.request.urlopen(url, timeout=5) as response:
            return response.read().decode()
    except (urllib.error.URLError, OSError) as exc:
        return f"  unreachable: {exc}\n"


def main(argv):
    services = load_contract()
    ring_stage = load_ring()

    only = argv[1] if len(argv) > 1 else None
    value = float(argv[2]) if len(argv) > 2 else 1.0
    hops = int(argv[3]) if len(argv) > 3 else 6

    print(f"contract: {CONTRACT}")
    if ring_stage is not None:
        print(f"py_weight (from python/ring_stage.py): {ring_stage.weight():.4f}")
    print()

    for name, (port, upstream, ring_lib, ring_symbol) in services.items():
        if only and name != only:
            continue

        print(f"== {name} :{port}  ffi -> {ring_lib}:{ring_symbol}  http -> {upstream}")
        print(probe(port, value, hops), end="")
        if 1:
            print()

    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
