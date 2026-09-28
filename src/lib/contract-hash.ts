import "server-only";
import { createHash } from "node:crypto";
import { canonicalJson } from "@/lib/domain/proposals";

/** SHA-256 of the agreement text in canonical form — binds a signature to exactly what was read. */
export function contentHash(content: unknown): string {
  return createHash("sha256").update(canonicalJson(content)).digest("hex");
}
