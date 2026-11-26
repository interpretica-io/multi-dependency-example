#!/usr/bin/env bash
# Starts a node of the web tier from dist/bin.
#
#   ./scripts/run.sh guess [service]   build if needed, then run in the foreground:
#                                      the ts example (node dist/main.js, from ts/)
#                                      by default, or the named web-tier service
#
# The ts example reads EXAMPLE_HOST / EXAMPLE_PORT (default 127.0.0.1:9100).
#
# The TypeScript node reads SERVICE_TS_HOST / SERVICE_TS_PORT
# (default 127.0.0.1:8084).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

case "${1:-}" in
    guess)
        if [ -z "${2:-}" ]; then
            if [ ! -f "$ROOT/ts/dist/main.js" ]; then
                "$ROOT/build.sh"
            fi
            cd "$ROOT/ts"
            exec node dist/main.js
        fi
        service="$2"
        case "$service" in
            gateway-rs|service-go|service-cs|service-ts) ;;
            *) echo "unknown service: $service" >&2; exit 2 ;;
        esac
        if [ ! -x "$ROOT/dist/bin/$service" ]; then
            "$ROOT/build.sh"
        fi
        exec "$ROOT/dist/bin/$service"
        ;;
    *)
        echo "usage: $0 guess [gateway-rs|service-go|service-cs|service-ts]" >&2
        exit 2
        ;;
esac
