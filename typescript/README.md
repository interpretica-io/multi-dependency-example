# TypeScript example: guess

Queries a ring web service (`GET /ring?value=&hops=`), the same contract as the
Go and C# nodes in `web/`, and prints the trace and the final `value=`.

- Node.js **18 or newer** (uses built-in `fetch` and `AbortSignal.timeout`) and npm.
- `GUESS_ENDPOINT` (required): base URL of the service, e.g. `http://127.0.0.1:8082`.
- Each network call times out after 5 seconds.

```
./build.sh                        # npm install + tsc, from the repository root
GUESS_ENDPOINT=http://127.0.0.1:8082 node typescript/dist/index.js [value] [hops]
./scripts/run.sh guess            # starts the web services, runs Go, C# and TypeScript examples
```
