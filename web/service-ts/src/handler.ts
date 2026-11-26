// The /ring contract shared with service-go and service-cs:
//
//   GET /ring?value=<float>&hops=<int>   ->  200 text/plain
//     one "[service-ts] hops=.. a -> b" line per node, then "value=<result>"
//
// Defaults: value=1.0, hops=6. Unlike the Go node, unparsable input is not
// silently replaced by the default: it is answered with 400 and a line that
// starts with "error:". When the upstream fails the node does not invent a
// value: it answers 504 (timeout) or 502 (anything else) with a JSON body
// {"error": "..."}.

export const DEFAULT_VALUE = 1.0;
export const DEFAULT_HOPS = 6;
export const MAX_HOPS = 64;

// The TypeScript node has no ring library to call into; its weight is fixed.
export const TS_WEIGHT = 1.0;

export interface Reply {
  status: number;
  body: string;
  contentType?: string;
}

// The upstream could not give a usable answer: 504 when it timed out, 502
// for every other failure (refused, reset, non-2xx, malformed reply).
export class UpstreamError extends Error {
  readonly status: number;
  constructor(cause: unknown) {
    const msg = cause instanceof Error ? cause.message : String(cause);
    super(msg.split("\n")[0]!.slice(0, 200));
    this.status = /timed out/.test(msg) ? 504 : 502;
  }
}

export type Forward = (value: number, hops: number) => Promise<{ value: number; trace: string }>;

export class BadInput extends Error {}

export function parseValue(raw: string | null): number {
  if (raw === null) {
    return DEFAULT_VALUE;
  }
  if (!/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(raw)) {
    throw new BadInput(`value must be a finite number, got "${raw.slice(0, 40)}"`);
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    throw new BadInput("value is out of range");
  }
  return parsed;
}

export function parseHops(raw: string | null): number {
  if (raw === null) {
    return DEFAULT_HOPS;
  }
  if (!/^\d{1,6}$/.test(raw)) {
    throw new BadInput(`hops must be a non-negative integer, got "${raw.slice(0, 40)}"`);
  }
  const parsed = Number(raw);
  if (parsed > MAX_HOPS) {
    throw new BadInput(`hops must be at most ${MAX_HOPS}`);
  }
  return parsed;
}

function pad(n: number, width: number, digits?: number): string {
  const text = digits === undefined ? String(n) : n.toFixed(digits);
  return text.padStart(width, " ");
}

export async function handle(value: number, hops: number, forward: Forward | null): Promise<string> {
  const next = (value * 0.75 + 3.0) * TS_WEIGHT;
  let body = `[service-ts] hops=${String(hops).padEnd(2)} ${pad(value, 10, 4)} -> ${pad(next, 10, 4)}`
    + `   ((v * 0.75 + 3) * ts_weight)\n`;

  let result = next;
  if (hops > 0 && forward !== null) {
    let up;
    try {
      up = await forward(next, hops - 1);
    } catch (e) {
      throw new UpstreamError(e);
    }
    body += up.trace;
    result = up.value;
  }
  return body + `value=${result}\n`;
}

export async function route(target: string, method: string, forward: Forward | null): Promise<Reply> {
  if (!target.startsWith("/") || target.startsWith("//")) {
    return { status: 400, body: "error: malformed request target\n" };
  }
  const cut = target.indexOf("?");
  const pathname = cut < 0 ? target : target.slice(0, cut);
  const params = new URLSearchParams(cut < 0 ? "" : target.slice(cut + 1));
  if (pathname !== "/ring") {
    return { status: 404, body: "error: not found\n" };
  }
  if (method !== "GET" && method !== "HEAD") {
    return { status: 405, body: "error: method not allowed\n" };
  }
  try {
    const value = parseValue(params.get("value"));
    const hops = parseHops(params.get("hops"));
    return { status: 200, body: await handle(value, hops, forward) };
  } catch (e) {
    if (e instanceof UpstreamError) {
      return {
        status: e.status,
        body: JSON.stringify({ error: `upstream failed: ${e.message}` }) + "\n",
        contentType: "application/json",
      };
    }
    if (e instanceof BadInput) {
      return { status: 400, body: `error: ${e.message}\n` };
    }
    return { status: 500, body: "error: internal\n" };
  }
}
