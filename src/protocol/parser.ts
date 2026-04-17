import { readFile } from "node:fs/promises";
import { parse as parseYaml } from "yaml";
import { ProtocolSchema } from "./schema.js";
import type { Protocol } from "./types.js";

export async function parseProtocolFile(path: string): Promise<Protocol> {
  const raw = await readFile(path, "utf8");
  const data = parseYaml(raw);
  const parsed = ProtocolSchema.parse(data);
  return parsed as Protocol;
}

export function parseProtocolString(yaml: string): Protocol {
  const data = parseYaml(yaml);
  return ProtocolSchema.parse(data) as Protocol;
}

export function parseProtocolObject(data: unknown): Protocol {
  return ProtocolSchema.parse(data) as Protocol;
}

export * from "./types.js";
