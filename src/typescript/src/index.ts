// Enters the ring through the web tier: asks the gateway to run the ring and
// prints what comes back.
//
//   ring-ts guess [value] [hops]
//
// The gateway address comes from RING_GATEWAY_URL (e.g. http://host:port);
// default http://127.0.0.1:8081 (the gateway-rs port in web/contract/services.tab).
// The optional RING_TIMEOUT_MS bounds every network call (default 5000 ms).

const EXIT_OK = 0;
const EXIT_FAIL = 1;
const EXIT_USAGE = 2;

const MAX_HOPS = 1000;
const MAX_BODY = 1 << 20;
const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_GATEWAY_URL = "http://127.0.0.1:8081";
const MAX_TIMEOUT_MS = 60000;

class UsageError extends Error {}

function parseValue(raw: string): number {
  if (!/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(raw)) {
    throw new UsageError(`value must be a finite number, got '${raw}'`);
  }
  const v = Number(raw);
  if (!Number.isFinite(v)) {
    throw new UsageError(`value must be a finite number, got '${raw}'`);
  }
  return v;
}

function parseHops(raw: string): number {
  if (!/^\d+$/.test(raw)) {
    throw new UsageError(`hops must be a non-negative integer, got '${raw}'`);
  }
  const h = Number(raw);
  if (!Number.isSafeInteger(h) || h > MAX_HOPS) {
    throw new UsageError(`hops must be between 0 and ${MAX_HOPS}, got '${raw}'`);
  }
  return h;
}

function parseTimeout(raw: string | undefined): number {
  if (raw === undefined || raw === "") {
    return DEFAULT_TIMEOUT_MS;
  }
  if (!/^\d+$/.test(raw)) {
    throw new UsageError(`RING_TIMEOUT_MS must be a positive integer, got '${raw}'`);
  }
  const t = Number(raw);
  if (t < 1 || t > MAX_TIMEOUT_MS) {
    throw new UsageError(`RING_TIMEOUT_MS must be between 1 and ${MAX_TIMEOUT_MS}, got '${raw}'`);
  }
  return t;
}

function gatewayUrl(raw: string | undefined): URL {
  if (raw === undefined || raw === "") {
    raw = DEFAULT_GATEWAY_URL;
  }
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new UsageError(`RING_GATEWAY_URL is not a valid URL: '${raw}'`);
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    throw new UsageError(`RING_GATEWAY_URL must be http or https, got '${u.protocol}'`);
  }
  return u;
}

async function readBounded(res: Response): Promise<string> {
  const text = await res.text();
  if (text.length > MAX_BODY) {
    throw new Error("response too large");
  }
  return text;
}

async function guess(args: string[], env: NodeJS.ProcessEnv): Promise<number> {
  if (args.length > 2) {
    throw new UsageError("too many arguments");
  }
  const value = args.length > 0 ? parseValue(args[0]) : 1.0;
  const hops = args.length > 1 ? parseHops(args[1]) : 6;
  const timeoutMs = parseTimeout(env.RING_TIMEOUT_MS);
  const base = gatewayUrl(env.RING_GATEWAY_URL);

  const url = new URL("/ring", base);
  url.searchParams.set("value", String(value));
  url.searchParams.set("hops", String(hops));

  console.log("ts-demo: entering the ring through the gateway");
  console.log(`         value=${value.toFixed(4)} hops=${hops}\n`);

  let res: Response;
  try {
    res = await fetch(url, {
      signal: AbortSignal.timeout(timeoutMs),
      redirect: "error",
    });
  } catch (e) {
    const name = e instanceof Error ? e.name : "";
    if (name === "TimeoutError" || name === "AbortError") {
      console.error(`ts-demo: gateway did not answer within ${timeoutMs} ms`);
    } else {
      console.error(`ts-demo: gateway unreachable: ${e instanceof Error ? e.message : String(e)}`);
    }
    return EXIT_FAIL;
  }

  let body: string;
  try {
    body = await readBounded(res);
  } catch (e) {
    console.error(`ts-demo: cannot read gateway response: ${e instanceof Error ? e.message : String(e)}`);
    return EXIT_FAIL;
  }
  if (!res.ok) {
    console.error(`ts-demo: gateway returned HTTP ${res.status}`);
    return EXIT_FAIL;
  }

  process.stdout.write(body.endsWith("\n") ? body : body + "\n");
  console.log("\nts-demo: done");
  return EXIT_OK;
}

async function main(argv: string[]): Promise<number> {
  const [cmd, ...rest] = argv;
  if (cmd !== "guess") {
    console.error("usage: ring-ts guess [value] [hops]   (env: RING_GATEWAY_URL, RING_TIMEOUT_MS)");
    return EXIT_USAGE;
  }
  try {
    return await guess(rest, process.env);
  } catch (e) {
    if (e instanceof UsageError) {
      console.error(`ts-demo: ${e.message}`);
      return EXIT_USAGE;
    }
    console.error(`ts-demo: unexpected failure: ${e instanceof Error ? e.message : String(e)}`);
    return EXIT_FAIL;
  }
}

main(process.argv.slice(2)).then(
  (code) => {
    process.exitCode = code;
  },
  (e) => {
    console.error(`ts-demo: unexpected failure: ${e instanceof Error ? e.message : String(e)}`);
    process.exitCode = EXIT_FAIL;
  },
);
