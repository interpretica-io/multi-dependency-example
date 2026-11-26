// Guess logic of the ring in TypeScript: the same five stages, formulas and
// weights as the C++, Rust, Go, C# and Python stages, run in one process.
//
//   rust -> go -> cs -> py -> cpp -> rust -> ...

export const DEFAULT_VALUE = 1.0;
export const DEFAULT_HOPS = 6;
export const MAX_HOPS = 64;

export class BadInput extends Error {}

interface Stage {
  name: string;
  formula: string;
  apply: (v: number) => number;
}

// Each stage multiplies by the weight of its chord neighbour.
const CS_WEIGHT = 1.04;
const CPP_WEIGHT = 1.01;
const RUST_WEIGHT = 1.02;
const GO_WEIGHT = 1.03;
const PY_WEIGHT = 1.05;

const STAGES: readonly Stage[] = [
  { name: "rust", formula: "((v * 1.5 + 1) * cs_weight)", apply: (v) => (v * 1.5 + 1) * CS_WEIGHT },
  { name: "go  ", formula: "((v / 2 + 7) * cpp_weight)", apply: (v) => (v / 2 + 7) * CPP_WEIGHT },
  { name: "cs  ", formula: "((v + 2) * rust_weight)", apply: (v) => (v + 2) * RUST_WEIGHT },
  { name: "py  ", formula: "((v * 0.8 + 3) * go_weight)", apply: (v) => (v * 0.8 + 3) * GO_WEIGHT },
  { name: "cpp ", formula: "(hypot(v, 3) * py_weight)", apply: (v) => Math.hypot(v, 3) * PY_WEIGHT },
];

export function parseValue(raw: string): number {
  if (!/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(raw)) {
    throw new BadInput(`value must be a finite number, got "${raw.slice(0, 40)}"`);
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    throw new BadInput("value is out of range");
  }
  return parsed;
}

export function parseHops(raw: string): number {
  if (!/^\d{1,6}$/.test(raw)) {
    throw new BadInput(`hops must be a non-negative integer, got "${raw.slice(0, 40)}"`);
  }
  const parsed = Number(raw);
  if (parsed > MAX_HOPS) {
    throw new BadInput(`hops must be at most ${MAX_HOPS}`);
  }
  return parsed;
}

export interface RingResult {
  trace: string[];
  result: number;
}

// Enters the ring at the Rust stage and runs until the hop counter is spent.
export function runRing(value: number, hops: number): RingResult {
  if (!Number.isFinite(value)) {
    throw new BadInput("value must be finite");
  }
  if (!Number.isInteger(hops) || hops < 0 || hops > MAX_HOPS) {
    throw new BadInput(`hops must be an integer from 0 to ${MAX_HOPS}`);
  }
  const trace: string[] = [];
  let v = value;
  for (let i = 0, left = hops; ; i++, left--) {
    const stage = STAGES[i % STAGES.length]!;
    const next = stage.apply(v);
    trace.push(`  [${stage.name}] hops=${String(left).padEnd(2)} ${v.toFixed(4).padStart(10)} -> `
      + `${next.toFixed(4).padStart(10)}   ${stage.formula}`);
    v = next;
    if (left <= 0) {
      break;
    }
  }
  if (!Number.isFinite(v)) {
    throw new BadInput("result is out of range");
  }
  return { trace, result: v };
}
