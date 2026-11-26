// Demo entry point: enters the ring at the Rust stage, like cpp-demo.
//
//   node dist/demo.js [value] [hops]
//
// Bad input prints one error line to stderr and exits 1.

import { DEFAULT_HOPS, DEFAULT_VALUE, parseHops, parseValue, runRing } from "./core";

function run(argv: string[]): number {
  if (argv.length > 2) {
    console.error("ts-demo: error: usage: demo [value] [hops]");
    return 1;
  }
  try {
    const value = argv[0] === undefined ? DEFAULT_VALUE : parseValue(argv[0]);
    const hops = argv[1] === undefined ? DEFAULT_HOPS : parseHops(argv[1]);
    const { trace, result } = runRing(value, hops);
    console.log("ts-demo: entering the ring at the Rust stage");
    console.log(`         value=${value.toFixed(4)} hops=${hops}\n`);
    console.log(trace.join("\n"));
    console.log(`\nts-demo: result = ${result.toFixed(4)}`);
    return 0;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`ts-demo: error: ${msg.split("\n")[0]}`);
    return 1;
  }
}

process.exitCode = run(process.argv.slice(2));
