// TypeScript example: GET /ring with the same contract and reply format as
// service-go and service-cs (value, hops; defaults 1.0 and 6).
//
// EXAMPLE_HOST (default 127.0.0.1) and EXAMPLE_PORT (default 9100) set the
// listen address. Empty, non-numeric or oversized input gets an error reply
// and the server keeps running. SIGTERM and SIGINT exit 0.

import * as http from "node:http";
import { route } from "./handler";

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 9100;

function listenPort(): number {
  const raw = process.env.EXAMPLE_PORT;
  if (raw === undefined || raw === "") {
    return DEFAULT_PORT;
  }
  if (!/^\d{1,5}$/.test(raw) || Number(raw) > 65535) {
    throw new Error(`EXAMPLE_PORT="${raw}" is not a port number`);
  }
  return Number(raw);
}

function main(): void {
  const host = process.env.EXAMPLE_HOST || DEFAULT_HOST;
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
  server.headersTimeout = 5000;
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
    console.error(`[example-ts] listen ${host}:${port} failed: ${err.message}`);
    process.exit(1);
  });

  const stop = (): void => {
    server.close();
    process.exit(0);
  };
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);

  server.listen(port, host, () => {
    console.log(`[example-ts] http://${host}:${port}/ring`);
  });
}

process.on("uncaughtException", (err) => {
  console.error(`[example-ts] uncaught: ${err.message}`);
});
process.on("unhandledRejection", (err) => {
  console.error(`[example-ts] unhandled rejection: ${String(err)}`);
});

try {
  main();
} catch (e) {
  console.error(`[example-ts] ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
}
