#!/usr/bin/env bash
# Runs the TypeScript example.  Usage: scripts/run.sh guess [value] [hops]
# The gateway address is taken from RING_GATEWAY_URL; when it is unset it is
# built from RING_GATEWAY_HOST and the port in web/contract/services.tab.
# With neither set the program exits with a usage error.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MAIN="$ROOT/typescript/dist/main.js"

if [ ! -f "$MAIN" ]; then
    echo "run.sh: $MAIN not found; run ./build.sh first" >&2
    exit 1
fi
if ! command -v node >/dev/null; then
    echo "run.sh: node is not installed" >&2
    exit 1
fi

if [ -z "${RING_GATEWAY_URL:-}" ]; then
    port="$(awk '$1=="gateway-rs"{print $2}' "$ROOT/web/contract/services.tab")"
    host="${RING_GATEWAY_HOST:-}"
    [ -n "$port" ] && [ -n "$host" ] && export RING_GATEWAY_URL="http://$host:$port"
fi

exec node "$MAIN" "$@"
