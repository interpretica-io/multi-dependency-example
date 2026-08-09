#!/usr/bin/env bash
# Builds the three projects in the only order that works for a dependency
# cycle: the language whose missing symbol can be left unresolved goes first.
#
#   1. Go   -> libgocore    (cpp_step deliberately left undefined)
#   2. Rust -> librustcore  (links libgocore)
#   3. C++  -> libcppcore   (links librustcore, closes the cycle for dyld)
#   4. Demo executables
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DIST_LIB="$ROOT/dist/lib"
DIST_BIN="$ROOT/dist/bin"

case "$(uname -s)" in
    Darwin) DYLIB_EXT="dylib" ;;
    *)      DYLIB_EXT="so" ;;
esac

mkdir -p "$DIST_LIB" "$DIST_BIN"

echo "==> [1/4] Go: libgocore.$DYLIB_EXT"
# cgo rejects "unusual" linker flags unless they are explicitly allowed;
# the ones in gocore.go are what let the cycle be linked at all.
export CGO_LDFLAGS_ALLOW='-Wl,-(U|install_name),.*|-Wl,--unresolved-symbols=.*'
(cd "$ROOT/go" && go build -buildmode=c-shared \
    -o "$DIST_LIB/libgocore.$DYLIB_EXT" .)

echo "==> [2/4] Rust: librustcore.$DYLIB_EXT"
(cd "$ROOT/rust" && cargo build --release -p rustcore)
cp "$ROOT/rust/target/release/librustcore.$DYLIB_EXT" "$DIST_LIB/"

echo "==> [3/4] C++: libcppcore.$DYLIB_EXT + cpp-demo"
cmake -S "$ROOT/cpp" -B "$ROOT/cpp/build" -DCMAKE_BUILD_TYPE=Release >/dev/null
cmake --build "$ROOT/cpp/build" --parallel

echo "==> [4/4] Rust: rust-demo"
if true; then
    (cd "$ROOT/rust" && cargo build --release -p rust-demo)
fi
cp "$ROOT/rust/target/release/rust-demo" "$DIST_BIN/"

echo
echo "Done. Artifacts in dist/:"
ls -1 "$DIST_LIB" "$DIST_BIN"
echo
echo "Run:  ./dist/bin/cpp-demo   [value] [hops]"
echo "      ./dist/bin/rust-demo  [value] [hops]"
