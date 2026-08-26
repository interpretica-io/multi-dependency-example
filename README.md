# multi-dependency-example

Five projects — in C++, Rust, Go, C# and Python — where **each one depends on two
others**. It is not a chain and not a single ring, but a dense cyclic graph: 5
nodes, 10 edges, every node has out-degree 2 and in-degree 2.

On top of this ring there is a **web tier** (`web/`): three more projects, HTTP
services in Rust, Go and C#. They also form a cycle, but they call each other
over the network, and each of them reaches into the ring with a different
linking method. In total there are 8 projects, two independent cycles and one
shared contract file that four languages depend on — see [Web tier](#web-tier).

```
                         ┌──────────────► cpp ◄─────────────┐
                         │              ╱   ╲               │
                         │         ring╱     ╲chord         │
                         │            ▼       ▼             │
                        go ◄────── rust      py ──────────► go
                         │ ring       ╲      ▲               │
                         │             ╲    ╱ ring           │
                         │        chord ▼  ╱                 │
                         └────────────► cs ◄─────────────────┘
                                        chord
```

Two edge lists make it easier to read:

| edge | calls | meaning |
|---|---|---|
| **ring** `X_step` | cpp → rust → go → cs → py → cpp | pipeline step, passes the value on |
| **chord** `X_weight` | cpp → py, rust → cs, go → cpp, cs → rust, py → go | factor that the stage multiplies its result by |

Every project exports two functions with a C ABI:

```c
double X_step(double value, int hops);   /* passes the value to the next language */
double X_weight(void);                   /* leaf: does not re-enter the ring */
```

`X_step` transforms the value, multiplies it by the weight it got from its
"chord" neighbour, and, while the hop counter is not exhausted, hands the result
to the next language. `X_weight` is a leaf, and that is exactly why the whole
construction terminates.

## Build and run

You need `cmake` and a C++17 compiler, `cargo`, `go`, .NET SDK 9+ (NativeAOT),
and Python 3 with embedding headers (`python3-config --embed`).

```sh
./build.sh              # build
./build.sh clean        # remove everything that was built
./build.sh rebuild      # clean + build

./dist/bin/cpp-demo   1 7      # enters the ring at the Rust stage
./dist/bin/rust-demo  2 4      # enters the ring at the C++ stage
python3 python/demo.py 1 5     # enters from a running interpreter

./dist/bin/gateway-rs          # web tier: :8081, :8082, :8083
./dist/bin/service-go
./dist/bin/service-cs
python3 web/tools/probe.py     # query all of them
```

`clean` lets the toolchains clean up after themselves (`cargo clean`,
`go clean`, the CMake `clean` target), and then removes `cpp/build`,
`csharp/{bin,obj,out}`, `web/service-cs/{bin,obj,out}`, `__pycache__` and the
shared `dist/`.

Output of `cpp-demo 1 7` (on the source without the injected defects, see below):

```
cpp-demo: entering the ring at the Rust stage
          value=1.0000 hops=7

  [rust] hops=7      1.0000 ->     2.6000   ((v * 1.5 + 1) * cs_weight)
  [go  ] hops=6      2.6000 ->     8.3830   ((v / 2 + 7) * cpp_weight)
  [cs  ] hops=5      8.3830 ->    10.5907   ((v + 2) * rust_weight)
  [py  ] hops=4     10.5907 ->    11.8167   ((v * 0.8 + 3) * go_weight)
  [cpp ] hops=3     11.8167 ->    12.8012   (hypot(v, 3) * py_weight)
  [rust] hops=2     12.8012 ->    21.0098   ((v * 1.5 + 1) * cs_weight)
  [go  ] hops=1     21.0098 ->    17.6799   ((v / 2 + 7) * cpp_weight)
  [cs  ] hops=0     17.6799 ->    20.0735   ((v + 2) * rust_weight)

cpp-demo: result = 20.0735
```

## How the cyclic graph is built

A cyclic dependency cannot be resolved directly: to link the first library you
need the last one, which does not exist yet. Two techniques solve this here.

**1. Languages with late binding go first.** Python and C# resolve their
outgoing calls at run time, not at link time, so they have no build-time
dependencies on the ring at all:

* Python calls `ctypes.CDLL(None)`. This opens the process itself, so any ring
  symbol that is already loaded is available by name.
* C# calls `dlsym(RTLD_DEFAULT, "...")` and invokes the result through
  `delegate* unmanaged[Cdecl]`, so no path has to be hard-coded in
  `[DllImport]`.

**2. The remaining native cycle is broken by one unresolved symbol.** After
Python and C#, the cycle `cpp → rust → go → cpp` is left. Go is built third and
deliberately leaves `cpp_weight` unresolved (`-Wl,-U,_cpp_weight` on macOS,
`-Wl,--unresolved-symbols=ignore-all` on Linux). By default cgo does not pass
such flags through, so `build.sh` sets `CGO_LDFLAGS_ALLOW`. The symbol is found
at process start, when dyld loads `libcppcore`.

This gives the only possible build order:

| # | project | links against | unresolved at link time |
|---|---|---|---|
| 1 | Python → `libpycore` | libpython only | the whole ring (ctypes) |
| 2 | C# → `libcscore` | nothing | the whole ring (dlsym) |
| 3 | Go → `libgocore` | libcscore | `cpp_weight` |
| 4 | Rust → `librustcore` | libgocore, libcscore | — |
| 5 | C++ → `libcppcore` | librustcore, libpycore | — |

To check the graph:

```sh
otool -L dist/lib/librustcore.dylib          # -> libgocore, libcscore
otool -L dist/lib/libcppcore.dylib           # -> librustcore, libpycore
nm -u  dist/lib/libgocore.dylib | grep cpp_  # -> _cpp_weight (undefined)
```

## Web tier

`web/` contains three separate projects, each with its own HTTP server, which
also form a cycle. The difference from the ring is that this cycle exists **only
at run time**: the binaries contain no references to each other, and the link is
defined by port numbers in a shared contract file.

```
                    http                         http
   gateway-rs :8081 ────► service-go :8082 ────► service-cs :8083
        ▲                                              │
        └──────────────────── http ────────────────────┘

   ffi ↓ librustcore        ffi ↓ libcscore        ffi ↓ libcppcore
       (rust_step)              (cs_weight)            (cpp_weight)
                        ── all of this is the ring ──
```

| edge | how it is linked | where to look |
|---|---|---|
| gateway-rs → service-go | HTTP `GET /ring`, port from the contract | `web/gateway-rs/src/main.rs` |
| service-go → service-cs | HTTP `GET /ring`, port from the contract | `web/service-go/main.go` |
| service-cs → gateway-rs | HTTP `GET /ring`, port from the contract | `web/service-cs/Program.cs` |
| gateway-rs → librustcore | link time, `extern "C" fn rust_step` | `web/gateway-rs/build.rs` |
| service-go → libcscore | cgo: `-L dist/lib -lcscore` + `#include <ring/ring.h>` | `web/service-go/ring.go` |
| service-cs → libcppcore | `NativeLibrary.Load` + `GetExport` at run time | `web/service-cs/RingBridge.cs` |

Every node makes one step: it scales the value by the weight of "its own" ring
symbol and passes the result to the next service, until the hop counter runs
out. This is the same technique as in the ring, but at the HTTP level.

### One contract for four languages

`web/contract/services.tab` is the only place where ports, upstreams and ring
symbol names are written down. Four projects read it, and all four read it
differently, at four different moments of the life cycle:

| project | mechanism | when |
|---|---|---|
| `web/gateway-rs` | `include_str!("../../contract/services.tab")` | compile time |
| `web/service-cs` | `<EmbeddedResource>` + `GetManifestResourceStream` | compile time |
| `web/service-go` | path baked in by the linker: `-ldflags "-X main.contractPath=…"` | link time |
| `web/tools/probe.py` | plain `open()` | run time |

So changing a port in one row of the table means rebuilding three binaries in
three languages. `go:embed` cannot reach the file (it is outside the package
directory), which is why Go receives the path through `-X` — build.sh fills it
in.

There are also links besides the contract: `web/service-go/ring.go` includes
`cpp/include/ring/ring.h`, the same header the C++ stage of the ring is compiled
against, so the prototypes cannot drift apart; and `web/tools/probe.py` imports
`python/ring_stage.py` and takes the weight of the Python stage from the ring
source instead of a copied number.

### Running

The services are built by stages 7–9 of the same `./build.sh`, after the ring,
because each of them needs a finished `dist/lib`. The binaries are placed in
`dist/bin`.

```sh
./dist/bin/gateway-rs     # :8081, each in its own terminal
./dist/bin/service-go     # :8082
./dist/bin/service-cs     # :8083

curl 'http://127.0.0.1:8081/ring?value=1&hops=5'
python3 web/tools/probe.py             # query all nodes at once
python3 web/tools/probe.py gateway-rs 1 5
```

Output of `curl` on the source without the injected defects:

```
[gateway-rs] hops=5      1.0000 ->     2.6000   (rust_step, FFI into librustcore)
[service-go] hops=4      2.6000 ->     7.9040   ((v + 5) * cs_weight, FFI into libcscore)
[service-cs] hops=3      7.9040 ->     8.0315   ((v * 0.5 + 4) * cpp_weight, FFI into libcppcore)
[gateway-rs] hops=2      8.0315 ->    13.5692   (rust_step, FFI into librustcore)
[service-go] hops=1     13.5692 ->    19.3119   ((v + 5) * cs_weight, FFI into libcscore)
[service-cs] hops=0     19.3119 ->    13.7925   ((v * 0.5 + 4) * cpp_weight, FFI into libcppcore)
value=13.792528714240001
```

The request walks the whole cycle and comes back to `gateway-rs`, so its own
Rust TCP server handles every connection in a separate thread: with a
single-threaded accept loop the node would wait for its own answer until the
timeout.

`RING_SKIP_CSHARP=1` also skips stage 9. Without .NET only two nodes out of
three are left, and the cycle is open in that case.

## Layout

```
python/ring_stage.py    the Python stage; outward calls go through ctypes.CDLL(None)
python/src/pycore.c     libpycore — C host, embeds CPython and exports
                        py_step / py_weight (Python itself exports no C symbols)
python/demo.py          entry into the ring from a normal interpreter
csharp/RingStage.cs     libcscore — NativeAOT, [UnmanagedCallersOnly] outward,
                        dlsym(RTLD_DEFAULT) inward
csharp/cscore.csproj    PublishAot + NativeLib=Shared + install_name
go/gocore.go            libgocore — c-shared, //export, cgo calls to cs_step/cpp_weight
rust/core/              librustcore — cdylib, #[no_mangle], extern go_step/cs_weight
rust/core/build.rs      links against libgocore and libcscore, install_name/rpath
rust/demo/              rust-demo — enters the ring through cpp_step
cpp/include/ring/ring.h the shared C ABI of all ten functions
cpp/src/cppcore.cpp     libcppcore — cpp_step/cpp_weight
cpp/src/demo.cpp        cpp-demo — enters the ring through rust_step
build.sh                builds in the correct order + clean/rebuild, output in dist/

web/contract/services.tab   shared contract of the web tier: ports, upstreams,
                            ring symbols; read by all four languages
web/gateway-rs/             gateway-rs — HTTP node in Rust, its own TCP server
web/gateway-rs/build.rs     links against librustcore (+ libcppcore for cpp_weight)
web/gateway-rs/src/contract.rs  include_str! of the contract — it goes into the binary
web/service-go/             service-go — HTTP node in Go (net/http)
web/service-go/ring.go      cgo: -I cpp/include + links against libcscore
web/service-cs/             service-cs — HTTP node in C# (ASP.NET Core, NativeAOT)
web/service-cs/RingBridge.cs    NativeLibrary.Load(dist/lib/libcppcore) + GetExport
web/tools/probe.py          queries all nodes; imports python/ring_stage.py
```

All libraries are collected in `dist/lib`, so that one `-L`/rpath is enough for
every toolchain, and the executables go into `dist/bin` with an rpath to
`dist/lib`.

## Notes

* Verified on macOS (arm64, Apple clang 21, rustc 1.96, go 1.26, .NET 9,
  Python 3.14). The Linux flags are in place, but were not tested there. On
  Windows this scheme would need `.def` files or dllimport wrappers, because PE
  has no symbols that stay unresolved until run time.
* `python/demo.py` loads `libcppcore` with `RTLD_GLOBAL`. This is not cosmetic:
  the flat namespace through which `cpp_weight` is resolved only sees globally
  loaded images, and with the default value (`RTLD_LOCAL`) `dlopen` fails with
  `symbol not found in flat namespace '_cpp_weight'`.
* macOS uses a two-level namespace: symbols do not "leak" through an
  intermediate library, so `cpp-demo` links against both `libcppcore` and
  `librustcore` — it calls `rust_step` directly.
* There are deliberately no separate Go and C# demos in the ring itself: a Go
  executable linked against `libgocore` would get two Go runtimes in one
  process. For the same reason `service-go` in the web tier links against
  `libcscore` and not `libgocore`. For .NET the restriction is softer:
  `service-cs` is a NativeAOT binary that loads `libcppcore`, and through it the
  NativeAOT library `libcscore`; two AOT images can coexist in one process.
* ILCompiler invokes `clang` by name; `build.sh` points at `/usr/bin/clang`
  explicitly, otherwise the Homebrew LLVM config sends the link step to an SDK
  that is not installed.
* `service-cs` pulls the ring symbol in through `NativeLibrary.Load` with the
  path `dist/bin/../lib`, and not through `dlsym(RTLD_DEFAULT)` like
  `csharp/RingStage.cs`: there the ring is already loaded into the process,
  while here it is a standalone executable and the library must be loaded
  explicitly.
* **One trivial error was injected deliberately into every source file** (always
  an always-true condition such as `if (5)` / `if true`). The repository is used
  as a corpus for testing review tools. Because of these errors the ring stops
  at the very first stage when it runs, and in the web tier each node answers
  only for itself (the condition in `forward` cuts off the hop to the upstream).
  The reference outputs above were taken from the code without these defects.
