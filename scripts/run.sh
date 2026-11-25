#!/usr/bin/env bash
# Runs a demo against the built project.
#
#   ./scripts/run.sh guess [value] [hops]
#
# guess starts the web tier (gateway-rs, service-go, service-cs; ports from
# web/contract/services.tab), then runs the TypeScript example against each
# node and the Go and C# nodes it is compared with. Everything it started is
# stopped on exit. Run ./build.sh first.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONTRACT="$ROOT/web/contract/services.tab"

usage() { echo "usage: $0 guess [value] [hops]" >&2; exit 2; }
[ "${1:-}" = "guess" ] || usage
shift
VALUE="${1:-1.0}"
HOPS="${2:-6}"

[ -f "$ROOT/typescript/dist/index.js" ] || { echo "run.sh: typescript is not built; run ./build.sh" >&2; exit 1; }
command -v node >/dev/null || { echo "run.sh: node not found (Node.js >= 18 needed)" >&2; exit 1; }

PIDS=()
cleanup() {
    for pid in "${PIDS[@]:-}"; do
        [ -n "$pid" ] && kill "$pid" 2>/dev/null || true
    done
}
trap cleanup EXIT

port_of() { awk -v n="$1" '$1 !~ /^#/ && $1 == n {print $2}' "$CONTRACT"; }

for svc in gateway-rs service-go service-cs; do
    bin="$ROOT/dist/bin/$svc"
    if [ ! -x "$bin" ]; then
        echo "run.sh: $bin missing; run ./build.sh" >&2
        exit 1
    fi
    "$bin" >/dev/null 2>&1 &
    PIDS+=("$!")
done

wait_port() {
    local port="$1"
    for _ in $(seq 1 50); do
        (exec 3<>"/dev/tcp/127.0.0.1/$port") 2>/dev/null && return 0
        sleep 0.2
    done
    echo "run.sh: nothing listens on port $port" >&2
    return 1
}

status=0
for svc in service-go service-cs gateway-rs; do
    port="$(port_of "$svc")"
    wait_port "$port"
    echo "== guess (TypeScript) -> $svc :$port"
    GUESS_ENDPOINT="http://127.0.0.1:$port" node "$ROOT/typescript/dist/index.js" "$VALUE" "$HOPS" || status=1
done
exit "$status"
