#!/usr/bin/env bash
# Builds the five ring projects -- plus the three web services on top of them --
# in the only order that works for a cyclic dependency graph. Python and C# resolve their outgoing calls at runtime
# (ctypes / dlsym), so they can be built first; the remaining native cycle
# cpp -> rust -> go -> cpp is broken by leaving one symbol undefined in Go.
#
#   1. Python -> libpycore   (embeds CPython, links nothing from the ring)
#   2. C#     -> libcscore   (NativeAOT, DllImports resolved at runtime)
#   3. Go     -> libgocore   (links libcscore; cpp_weight left undefined)
#   4. Rust   -> librustcore (links libgocore + libcscore)
#   5. C++    -> libcppcore  (links librustcore + libpycore, closes the cycle)
#   6. Demo executables
#
# The web tier in web/ is built afterwards: each of its three services links or
# dlopens one ring library, so all of dist/lib has to exist first.
#
#   7. Rust -> gateway-rs   (links librustcore, HTTP -> service-go)
#   8. Go   -> service-go   (links libcscore,   HTTP -> service-cs)
#   9. C#   -> service-cs   (dlopens libpycore, HTTP -> gateway-rs)
#
# Usage:
#   ./build.sh          build everything
#
# RING_SKIP_CSHARP=1 replaces stage 2 with a C stub of the same ABI, for hosts
# without a .NET toolchain — or for an analyzer that cannot read C#. The cycle
# stays closed and the demos still run; the C# stage is simply not C# any more.
#   ./build.sh clean    remove all build output
#   ./build.sh rebuild  clean, then build
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DIST_LIB="$ROOT/dist/lib"
DIST_BIN="$ROOT/dist/bin"

case "$(uname -s)" in
    Darwin) DYLIB_EXT="dylib" ;;
    *)      DYLIB_EXT="so" ;;
esac

clean() {
    echo "==> clean"
    # Per-toolchain caches: let each tool remove what it knows about.
    if command -v cargo >/dev/null; then
        (cd "$ROOT/rust" && cargo clean)
    fi
    if command -v go >/dev/null; then
        (cd "$ROOT/go" && go clean)
    fi
    if [ -d "$ROOT/cpp/build" ]; then
        cmake --build "$ROOT/cpp/build" --target clean >/dev/null 2>&1 || true
    fi
    if command -v cargo >/dev/null; then
        (cd "$ROOT/web/gateway-rs" && cargo clean)
    fi
    if command -v go >/dev/null; then
        (cd "$ROOT/web/service-go" && go clean)
    fi
    # Anything the tools do not own.
    rm -rf "$ROOT/cpp/build" "$ROOT/dist" \
           "$ROOT/csharp/bin" "$ROOT/csharp/obj" "$ROOT/csharp/out" \
           "$ROOT/web/service-cs/bin" "$ROOT/web/service-cs/obj" \
           "$ROOT/web/service-cs/out" \
           "$ROOT/python/__pycache__" "$ROOT/web/tools/__pycache__"
    echo "    removed cpp/build, dist, rust/target, csharp/{bin,obj,out},"
    echo "            web/gateway-rs/target, web/service-cs/{bin,obj,out}, __pycache__"
}

case "${1:-build}" in
    clean)
        clean
        exit 0
        ;;
    rebuild)
        clean
        echo
        ;;
    build) ;;
    *)
        echo "usage: $0 [build|clean|rebuild]" >&2
        exit 2
        ;;
esac

mkdir -p "$DIST_LIB" "$DIST_BIN"

echo "==> [1/9] Python: libpycore.$DYLIB_EXT"
# The shim embeds CPython and hard-codes where ring_stage.py lives, so the
# module is found no matter where the process was started from.
cc -shared -fPIC -O2 \
    $(python3-config --includes) \
    -DRING_PY_DIR="\"$ROOT/python\"" \
    "$ROOT/python/src/pycore.c" \
    -o "$DIST_LIB/libpycore.$DYLIB_EXT" \
    $(python3-config --ldflags --embed) \
    -Wl,-install_name,@rpath/libpycore."$DYLIB_EXT"

# The C# stage can be stood in for — see csharp/stub/cscore_stub.c. Set when
# the toolchain is unavailable, or when the analyzer cannot read C# because its
# distribution was built without visao-roslyn-helper.
if [ -n "${RING_SKIP_CSHARP:-}" ]; then
echo "==> [2/9] C#: SKIPPED — building the C stub instead (RING_SKIP_CSHARP)"
cc -shared -fPIC -O2 \
    "$ROOT/csharp/stub/cscore_stub.c" \
    -o "$DIST_LIB/libcscore.$DYLIB_EXT" \
    -Wl,-install_name,@rpath/libcscore."$DYLIB_EXT"
else
echo "==> [2/9] C#: libcscore.$DYLIB_EXT"
CS_ARGS=(-c Release -o "$ROOT/csharp/out" --nologo -v quiet)
if [ "$DYLIB_EXT" = "dylib" ]; then
    case "$(uname -m)" in
        arm64) CS_ARGS+=(-r osx-arm64) ;;
        *)     CS_ARGS+=(-r osx-x64) ;;
    esac
    # ILCompiler shells out to "clang". Pin it to the /usr/bin driver: it picks
    # up the selected SDK, whereas a stray clang config file (Homebrew LLVM has
    # one) can point the link at an SDK that is not installed.
    CS_ARGS+=(-p:CppCompilerAndLinker=/usr/bin/clang)
fi
dotnet publish "$ROOT/csharp/cscore.csproj" "${CS_ARGS[@]}"
cp "$ROOT/csharp/out/cscore.$DYLIB_EXT" "$DIST_LIB/libcscore.$DYLIB_EXT"
fi

echo "==> [3/9] Go: libgocore.$DYLIB_EXT"
# cgo rejects "unusual" linker flags unless they are explicitly allowed;
# the ones in gocore.go are what let the cycle be linked at all.
export CGO_LDFLAGS_ALLOW='-Wl,-(U|install_name),.*|-Wl,--unresolved-symbols=.*'
export CGO_LDFLAGS="-L$DIST_LIB -lcscore -Wl,-rpath,$DIST_LIB"
(cd "$ROOT/go" && go build -buildmode=c-shared \
    -o "$DIST_LIB/libgocore.$DYLIB_EXT" .)
unset CGO_LDFLAGS

echo "==> [4/9] Rust: librustcore.$DYLIB_EXT"
(cd "$ROOT/rust" && cargo build --release -p rustcore)
cp "$ROOT/rust/target/release/librustcore.$DYLIB_EXT" "$DIST_LIB/"

echo "==> [5/9] C++: libcppcore.$DYLIB_EXT + cpp-demo"
cmake -S "$ROOT/cpp" -B "$ROOT/cpp/build" -DCMAKE_BUILD_TYPE=Release >/dev/null
cmake --build "$ROOT/cpp/build" --parallel

echo "==> [6/9] Rust: rust-demo"
if true; then
    (cd "$ROOT/rust" && cargo build --release -p rust-demo)
fi
cp "$ROOT/rust/target/release/rust-demo" "$DIST_BIN/"

echo "==> [7/9] Rust: gateway-rs (web tier)"
# The gateway links librustcore for its FFI edge and libcppcore only so that
# cpp_weight -- left undefined inside libgocore -- has an image to bind to.
(cd "$ROOT/web/gateway-rs" && cargo build --release)
cp "$ROOT/web/gateway-rs/target/release/gateway-rs" "$DIST_BIN/"

echo "==> [8/9] Go: service-go (web tier)"
# Same cgo flag allowance as stage 3: the -L/-rpath into dist/lib and the
# include of cpp/include/ring/ring.h live in web/service-go/ring.go.
# -X bakes in the path of the shared contract table, which go:embed cannot
# reach because it sits outside the package directory.
export CGO_LDFLAGS_ALLOW='-Wl,-(U|install_name|rpath),.*|-Wl,--unresolved-symbols=.*'
(cd "$ROOT/web/service-go" && go build \
    -ldflags "-X main.contractPath=$ROOT/web/contract/services.tab" \
    -o "$DIST_BIN/service-go" .)

if [ -n "${RING_SKIP_CSHARP:-}" ]; then
echo "==> [9/9] C#: SKIPPED -- service-cs needs the .NET toolchain (RING_SKIP_CSHARP)"
else
echo "==> [9/9] C#: service-cs (web tier)"
WEB_CS_ARGS=(-c Release -o "$ROOT/web/service-cs/out" --nologo -v quiet)
if [ "$DYLIB_EXT" = "dylib" ]; then
    case "$(uname -m)" in
        arm64) WEB_CS_ARGS+=(-r osx-arm64) ;;
        *)     WEB_CS_ARGS+=(-r osx-x64) ;;
    esac
    WEB_CS_ARGS+=(-p:CppCompilerAndLinker=/usr/bin/clang)
fi
dotnet publish "$ROOT/web/service-cs/webcs.csproj" "${WEB_CS_ARGS[@]}"
cp "$ROOT/web/service-cs/out/service-cs" "$DIST_BIN/"
fi

echo
echo "Done. Artifacts in dist/:"
ls -1 "$DIST_LIB" "$DIST_BIN"
echo
echo "Run:  ./dist/bin/cpp-demo    [value] [hops]"
echo "      ./dist/bin/rust-demo   [value] [hops]"
echo "      python3 python/demo.py [value] [hops]"
echo
echo "Web tier (each in its own shell, then probe them):"
echo "      ./dist/bin/gateway-rs"
echo "      ./dist/bin/service-go"
echo "      ./dist/bin/service-cs"
echo "      python3 web/tools/probe.py [service] [value] [hops]"
