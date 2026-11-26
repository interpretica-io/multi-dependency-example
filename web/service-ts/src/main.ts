// service-ts -- the TypeScript node of the web tier.
//
//   http edge: service-ts -> gateway-rs   (GET /ring, port from the contract)
//
// RING_HOST and RING_PORT give the listen address and are both required: an
// unset one prints one error line and exits 1 at once. The upstream is on
// RING_HOST, at the gateway-rs port from the contract; SERVICE_TS_UPSTREAM
// ("host:port") overrides it, SERVICE_TS_CONTRACT sets the contract path.
// Every network call has a 5 s connect timeout and a 5 s read timeout.
// Nothing thrown while serving a request leaves the request: it becomes an
// error reply. Any other error prints one line and exits 1.

import * as http from "node:http";
import { findService, loadContract } from "./contract";
import { Forward, route } from "./handler";

const TIMEOUT_MS = 5000;
const DEFAULT_UPSTREAM = "gateway-rs";

function requireEnv(name: string): string {
  const raw = process.env[name];
  if (raw === undefined || raw === "") {
    throw new Error(`${name} is not set`);
  }
  return raw;
}

function parsePort(name: string, raw: string): number {
  if (!/^\d{1,5}$/.test(raw) || Number(raw) > 65535) {
    throw new Error(`${name}="${raw.slice(0, 40)}" is not a port number`);
  }
  return Number(raw);
}

// GET with a connect timeout and a read timeout of TIMEOUT_MS each.
function httpGet(host: string, port: number, path: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.get({ host, port, path, timeout: TIMEOUT_MS, agent: false }, (res) => {
      res.setTimeout(TIMEOUT_MS, () => req.destroy(new Error("read timed out")));
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8") }));
      res.on("error", reject);
    });
    const connectTimer = setTimeout(() => req.destroy(new Error("connect timed out")), TIMEOUT_MS);
    req.on("socket", (socket) => {
      socket.on("connect", () => clearTimeout(connectTimer));
    });
    req.on("close", () => clearTimeout(connectTimer));
    req.on("timeout", () => req.destroy(new Error("timed out")));
    req.on("error", reject);
  });
}

function makeForward(host: string, port: number): Forward {
  return async (value, hops) => {
    const path = `/ring?value=${encodeURIComponent(String(value))}&hops=${hops}`;
    const response = await httpGet(host, port, path);
    const raw = response.body;
    if (response.status < 200 || response.status > 299) {
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

function resolveUpstream(host: string): Forward | null {
  const override = process.env.SERVICE_TS_UPSTREAM;
  if (override !== undefined && override !== "") {
    const m = /^(.+):(\d{1,5})$/.exec(override);
    if (m === null || Number(m[2]) > 65535) {
      throw new Error(`SERVICE_TS_UPSTREAM="${override.slice(0, 80)}" is not host:port`);
    }
    return makeForward(m[1]!, Number(m[2]));
  }
  try {
    const upstream = findService(loadContract(), DEFAULT_UPSTREAM);
    return upstream ? makeForward(host, upstream.port) : null;
  } catch (e) {
    console.warn(`[service-ts] no upstream: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}

function main(): void {
  const host = requireEnv("RING_HOST");
  const port = parsePort("RING_PORT", requireEnv("RING_PORT"));
  const forward = resolveUpstream(host);

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
  server.headersTimeout = TIMEOUT_MS;
  server.requestTimeout = TIMEOUT_MS;
  server.on("clientError", (_err, socket) => {
    if (socket.writable) {
      socket.end("HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n");
    } else {
      socket.destroy();
    }
  });
  server.on("error", (err) => {
    fail(new Error(`listen ${host}:${port} failed: ${err.message}`));
  });
  server.listen(port, host, () => {
    console.log(`[service-ts] listening on ${host}:${port} path /ring`);
  });
}

function fail(err: unknown): never {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`[service-ts] error: ${msg.split("\n")[0]}`);
  process.exit(1);
}

process.on("uncaughtException", fail);
process.on("unhandledRejection", fail);

try {
  main();
} catch (e) {
  fail(e);
}
