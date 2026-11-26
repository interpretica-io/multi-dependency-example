#!/usr/bin/env bash
# Starts a node of the web tier from dist/bin.
#
#   ./scripts/run.sh guess [value] [hops]
#                                      build if needed, run the TypeScript demo
#                                      (node dist/demo.js) and print its result
#   ./scripts/run.sh guess serve       the ts example as an HTTP server (node dist/main.js)
#   ./scripts/run.sh guess <service>   build if needed, run the named web-tier service
#
# The ts server reads RING_HOST / RING_PORT (both required).
#
# The TypeScript node reads SERVICE_TS_HOST / SERVICE_TS_PORT
# (default 127.0.0.1:8084).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

case "${1:-}" in
    guess)
        service="${2:-}"
        case "$service" in
            gateway-rs|service-go|service-cs|service-ts) ;;
            serve)
                if [ ! -f "$ROOT/ts/dist/main.js" ]; then
                    "$ROOT/build.sh"
                fi
                cd "$ROOT/ts"
                exec node dist/main.js
                ;;
            *)
                if [ ! -f "$ROOT/ts/dist/demo.js" ]; then
                    "$ROOT/build.sh"
                fi
                cd "$ROOT/ts"
                exec node dist/demo.js "${@:2}"
                ;;
        esac
        if [ ! -x "$ROOT/dist/bin/$service" ]; then
            "$ROOT/build.sh"
        fi
        exec "$ROOT/dist/bin/$service"
        ;;
    *)
        echo "usage: $0 guess [value] [hops] | serve | gateway-rs | service-go | service-cs | service-ts" >&2
        exit 2
        ;;
esac
