// guess -- the TypeScript example of the ring's HTTP demo.
//
// Same contract as the Go and C# nodes of the web tier: GET <endpoint>/ring
// with ?value=<float>&hops=<int> answers text/plain lines, trace lines first,
// then a final "value=<float>" line. This client sends one such request and
// prints the trace and the value.
//
//   GUESS_ENDPOINT=http://host:port node dist/index.js [value] [hops]
//
// The endpoint comes only from the environment; there is no default.

const TIMEOUT_MS = 5000;

function fail(message: string, code = 1): never {
  console.error(`[guess-ts] ${message}`);
  process.exit(code);
}

function parseArgs(argv: string[]): { value: number; hops: number } {
  const value = argv[0] !== undefined ? Number(argv[0]) : 1.0;
  const hops = argv[1] !== undefined ? Number(argv[1]) : 6;
  if (!Number.isFinite(value)) fail(`value is not a number: ${argv[0]}`, 2);
  if (!Number.isInteger(hops) || hops < 0) fail(`hops is not a non-negative integer: ${argv[1]}`, 2);
  return { value, hops };
}

function buildUrl(endpoint: string, value: number, hops: number): URL {
  let url: URL;
  try {
    url = new URL("/ring", endpoint);
  } catch {
    return fail(`GUESS_ENDPOINT is not a valid URL: ${endpoint}`, 2);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    fail(`GUESS_ENDPOINT must be http or https: ${endpoint}`, 2);
  }
  url.searchParams.set("value", String(value));
  url.searchParams.set("hops", String(hops));
  return url;
}

// Splits a ring body into its trace and the final value, as the Go node does.
function parseBody(raw: string): { trace: string[]; value: string } {
  const trace: string[] = [];
  let value: string | undefined;
  for (const line of raw.split("\n")) {
    if (line.startsWith("value=")) {
      const text = line.slice("value=".length).trim();
      if (!Number.isFinite(Number(text)) || text === "") throw new Error(`bad value line: ${line}`);
      value = text; // echoed verbatim, as the node formatted it
    } else if (line !== "") {
      trace.push(line);
    }
  }
  if (value === undefined) throw new Error("response has no value= line");
  return { trace, value };
}

async function main(): Promise<void> {
  const endpoint = process.env.GUESS_ENDPOINT;
  if (!endpoint) fail("GUESS_ENDPOINT is not set (e.g. http://127.0.0.1:8082)", 2);

  const { value, hops } = parseArgs(process.argv.slice(2));
  const url = buildUrl(endpoint, value, hops);

  let body: string;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!response.ok) fail(`${url.origin} answered HTTP ${response.status}`);
    body = await response.text();
  } catch (err) {
    const timedOut = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
    return fail(timedOut ? `${url.origin} did not answer within ${TIMEOUT_MS / 1000} s` : `${url.origin} unreachable: ${String(err)}`);
  }

  try {
    const result = parseBody(body);
    for (const line of result.trace) console.log(line);
    console.log(`value=${result.value}`);
  } catch (err) {
    fail(`malformed response: ${(err as Error).message}`);
  }
}

main();
