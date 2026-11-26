// TypeScript example: GET /ring with the same contract and reply format as
// service-go and service-cs (value, hops; defaults 1.0 and 6).
//
// RING_HOST and RING_PORT set the listen address; both are required and an
// unset one prints one error line and exits 1. Empty, non-numeric or oversized input gets an error reply
// and the server keeps running. SIGTERM and SIGINT exit 0.

import * as http from "node:http";
import { listenPort, requireEnv } from "./env";
import { route } from "./handler";

const TIMEOUT_MS = 5000;

function main(): void {
  const host = requireEnv("RING_HOST");
  const port = listenPort();

  const server = http.createServer((req, res) => {
    route(req.url ?? "/", req.method ?? "GET", null)
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
  server.timeout = TIMEOUT_MS;
  server.keepAliveTimeout = TIMEOUT_MS;
  server.on("clientError", (_err, socket) => {
    if (socket.writable) {
      const body = "error: bad request\n";
      socket.end("HTTP/1.1 400 Bad Request\r\nContent-Type: text/plain\r\n"
        + `Content-Length: ${body.length}\r\nConnection: close\r\n\r\n${body}`);
    } else {
      socket.destroy();
    }
  });
  server.on("error", (err) => {
    fail(new Error(`listen ${host}:${port} failed: ${err.message}`));
  });

  const stop = (): void => {
    server.close();
    process.exit(0);
  };
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);

  server.listen(port, host, () => {
    console.log(`[example-ts] listening on ${host}:${port} path /ring`);
  });
}

function fail(err: unknown): never {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`[example-ts] error: ${msg.split("\n")[0]}`);
  process.exit(1);
}

process.on("uncaughtException", fail);
process.on("unhandledRejection", fail);

try {
  main();
} catch (e) {
  fail(e);
}
