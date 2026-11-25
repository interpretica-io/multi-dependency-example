#!/usr/bin/env bash
# Runs a demo against the built project.
#
#   ./scripts/run.sh guess [value] [hops]
#
# guess makes sure the web tier is up (gateway-rs, service-go, service-cs; ports
# from web/contract/services.tab; services already listening are reused, the
# others are started and stopped on exit), then runs the TypeScript example
# against the Go node, so its stdout can be compared with the other examples.
#
#   GUESS_ENDPOINT   use this endpoint instead of starting anything
#   GUESS_NODES      nodes to query, default "service-go"
#                    (any of service-go service-cs gateway-rs)
#
# Only the example's own output goes to stdout; progress goes to stderr.
# Run ./build.sh first.
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

if [ -n "${GUESS_ENDPOINT:-}" ]; then
    exec node "$ROOT/typescript/dist/index.js" "$VALUE" "$HOPS"
fi

PIDS=()
cleanup() {
    for pid in "${PIDS[@]:-}"; do
        [ -n "$pid" ] && kill "$pid" 2>/dev/null || true
    done
}
trap cleanup EXIT

port_of() { awk -v n="$1" '$1 !~ /^#/ && $1 == n {print $2}' "$CONTRACT"; }
listening() { (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null; }

wait_port() {
    local port="$1"
    for _ in $(seq 1 50); do
        listening "$port" && return 0
        sleep 0.2
    done
    echo "run.sh: nothing listens on port $port" >&2
    return 1
}

for svc in gateway-rs service-go service-cs; do
    port="$(port_of "$svc")"
    listening "$port" && continue
    bin="$ROOT/dist/bin/$svc"
    if [ ! -x "$bin" ]; then
        echo "run.sh: $bin missing; run ./build.sh" >&2
        continue
    fi
    "$bin" >/dev/null 2>&1 &
    PIDS+=("$!")
done

status=0
for svc in ${GUESS_NODES:-service-go}; do
    port="$(port_of "$svc")"
    [ -n "$port" ] || { echo "run.sh: unknown node $svc" >&2; exit 2; }
    wait_port "$port" || { status=1; continue; }
    echo "== guess (TypeScript) -> $svc :$port" >&2
    GUESS_ENDPOINT="http://127.0.0.1:$port" node "$ROOT/typescript/dist/index.js" "$VALUE" "$HOPS" || status=1
done
exit "$status"
