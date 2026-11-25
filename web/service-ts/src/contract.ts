// Reader for web/contract/services.tab -- the fifth reader of that file, and
// like service-go it takes the path from outside: SERVICE_TS_CONTRACT, or the
// repository copy relative to the compiled output when the variable is unset.

import { readFileSync } from "node:fs";
import * as path from "node:path";

export interface Service {
  name: string;
  port: number;
  upstream: string;
  ringLib: string;
  ringSymbol: string;
}

export function defaultContractPath(): string {
  return process.env.SERVICE_TS_CONTRACT
    ?? path.resolve(__dirname, "..", "..", "contract", "services.tab");
}

export function parseContract(text: string, origin: string): Service[] {
  const services: Service[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (line === "" || line.startsWith("#")) {
      continue;
    }
    const cols = line.split(/\s+/);
    if (cols.length < 5) {
      throw new Error(`contract ${origin}: malformed line "${line}"`);
    }
    if (!/^\d+$/.test(cols[1]) || Number(cols[1]) > 65535) {
      throw new Error(`contract ${origin}: bad port in "${line}"`);
    }
    services.push({
      name: cols[0],
      port: Number(cols[1]),
      upstream: cols[2],
      ringLib: cols[3],
      ringSymbol: cols[4],
    });
  }
  return services;
}

export function loadContract(file: string = defaultContractPath()): Service[] {
  return parseContract(readFileSync(file, "utf8"), file);
}

export function findService(services: Service[], name: string): Service | undefined {
  return services.find((s) => s.name === name);
}
