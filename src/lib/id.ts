import { randomUUID, randomBytes } from "crypto";

export function newId(): string {
  return randomUUID();
}

export function newToken(bytes = 32): string {
  return randomBytes(bytes).toString("hex");
}
