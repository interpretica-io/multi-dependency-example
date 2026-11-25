// service-ts -- the TypeScript node of the web tier.
//
//   http edge: service-ts -> gateway-rs   (GET /ring, port from the contract)
//
// Listen address and port come from SERVICE_TS_HOST (default 127.0.0.1) and
// SERVICE_TS_PORT (default 8084); SERVICE_TS_UPSTREAM ("host:port") overrides
// the upstream, SERVICE_TS_CONTRACT the contract path. Nothing thrown while
// serving a request leaves the request: it becomes an error reply.

import * as http from "node:http";
import { findService, loadContract } from "./contract";
import { Forward, route } from "./handler";

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 8084;
const DEFAULT_UPSTREAM = "gateway-rs";

function envPort(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") {
    return fallback;
  }
  if (!/^\d{1,5}$/.test(raw) || Number(raw) > 65535) {
    throw new Error(`${name}="${raw}" is not a port number`);
  }
  return Number(raw);
}

function makeForward(host: string, port: number): Forward {
  return async (value, hops) => {
    const url = `http://${host}:${port}/ring?value=${encodeURIComponent(String(value))}&hops=${hops}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
    const raw = await response.text();
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    let upstreamValue = NaN;
    let trace = "";
    for (const line of raw.split("\n")) {
      if (line.startsWith("value=")) {
        upstreamValue = Number(line.slice("value=".length).trim());
      } else if (line !== "") {
        trace += line + "\n";
      }
    }
    if (Number.isNaN(upstreamValue)) {
      throw new Error("upstream reply has no value= line");
    }
    return { value: upstreamValue, trace };
  };
}

function resolveUpstream(): Forward | null {
  const override = process.env.SERVICE_TS_UPSTREAM;
  if (override !== undefined && override !== "") {
    const m = /^(.+):(\d{1,5})$/.exec(override);
    if (m === null || Number(m[2]) > 65535) {
      throw new Error(`SERVICE_TS_UPSTREAM="${override}" is not host:port`);
    }
    return makeForward(m[1], Number(m[2]));
  }
  try {
    const upstream = findService(loadContract(), DEFAULT_UPSTREAM);
    return upstream ? makeForward("127.0.0.1", upstream.port) : null;
  } catch (e) {
    console.warn(`[service-ts] no upstream: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}

function main(): void {
  const host = process.env.SERVICE_TS_HOST || DEFAULT_HOST;
  const port = envPort("SERVICE_TS_PORT", DEFAULT_PORT);
  const forward = resolveUpstream();

  const server = http.createServer((req, res) => {
    route(req.url ?? "/", req.method ?? "GET", forward)
      .catch(() => ({ status: 500, body: "error: internal\n" }))
      .then((reply) => {
        res.writeHead(reply.status, {
          "Content-Type": "text/plain",
          "Content-Length": Buffer.byteLength(reply.body),
        });
        res.end(req.method === "HEAD" ? undefined : reply.body);
      })
      .catch(() => res.destroy());
  });
  server.headersTimeout = 5000;
  server.on("clientError", (_err, socket) => {
    if (socket.writable) {
      socket.end("HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n");
    } else {
      socket.destroy();
    }
  });
  server.on("error", (err) => {
    console.error(`[service-ts] listen ${host}:${port} failed: ${err.message}`);
    process.exit(1);
  });
  server.listen(port, host, () => {
    console.log(`[service-ts] http://${host}:${port}/ring`);
  });
}

process.on("uncaughtException", (err) => {
  console.error(`[service-ts] uncaught: ${err.message}`);
});
process.on("unhandledRejection", (err) => {
  console.error(`[service-ts] unhandled rejection: ${String(err)}`);
});

try {
  main();
} catch (e) {
  console.error(`[service-ts] ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
}
