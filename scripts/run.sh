#!/usr/bin/env bash
# Runs the TypeScript example.  Usage: scripts/run.sh guess [value] [hops]
# The gateway address is taken from RING_GATEWAY_URL; when it is unset it is
# derived from the port in web/contract/services.tab.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MAIN="$ROOT/src/ts/dist/main.js"

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
    host="${RING_GATEWAY_HOST:-127.0.0.1}"
    [ -n "$port" ] && export RING_GATEWAY_URL="http://$host:$port"
fi

exec node "$MAIN" "$@"
