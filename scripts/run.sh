#!/usr/bin/env bash
# Starts a node of the web tier from dist/bin.
#
#   ./scripts/run.sh guess [value] [hops]
#                                      build if needed, run the TypeScript demo
#                                      (node dist/demo.js) and print its result
#   ./scripts/run.sh guess serve       the ts example as an HTTP server (node dist/main.js)
#   ./scripts/run.sh guess <service>   build if needed, run the named web-tier service
#
# The ts demo and the ts server read RING_HOST / RING_PORT (both required).
#
# The TypeScript node (service-ts) reads RING_HOST / RING_PORT too (both
# required).
#
# RING_HOST and RING_PORT are checked before anything is built: a missing one
# is an immediate error, not the end of a full build.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

need_ring_env() {
    local name
    for name in RING_HOST RING_PORT; do
        if [ -z "${!name:-}" ]; then
            echo "run.sh: error: $name is not set" >&2
            exit 1
        fi
    done
}

case "${1:-}" in
    guess)
        service="${2:-}"
        case "$service" in
            gateway-rs|service-go|service-cs|service-ts) ;;
            serve)
                need_ring_env
                if [ ! -f "$ROOT/ts/dist/main.js" ]; then
                    "$ROOT/build.sh"
                fi
                cd "$ROOT/ts"
                exec node dist/main.js
                ;;
            *)
                need_ring_env
                if [ ! -f "$ROOT/ts/dist/demo.js" ]; then
                    "$ROOT/build.sh"
                fi
                cd "$ROOT/ts"
                exec node dist/demo.js "${@:2}"
                ;;
        esac
        if [ "$service" = "service-ts" ]; then
            need_ring_env
        fi
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
