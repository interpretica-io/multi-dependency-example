// RING_HOST and RING_PORT: required by both the demo and the HTTP server.

export function requireEnv(name: string): string {
  const raw = process.env[name];
  if (raw === undefined || raw === "") {
    throw new Error(`${name} is not set`);
  }
  return raw;
}

export function listenPort(): number {
  const raw = requireEnv("RING_PORT");
  if (!/^\d{1,5}$/.test(raw) || Number(raw) > 65535) {
    throw new Error(`RING_PORT="${raw.slice(0, 40)}" is not a port number`);
  }
  return Number(raw);
}
