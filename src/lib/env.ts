import { readFileSync } from "node:fs";
export function secret(name: string): string {
  const path = process.env[name + "_FILE"];
  if (path) return readFileSync(path, "utf8").trim();
  return process.env[name] || "";
}
export function requiredSecret(name: string): string {
  const value = secret(name);
  if (!value) throw new Error(`Missing ${name} or ${name}_FILE`);
  return value;
}
