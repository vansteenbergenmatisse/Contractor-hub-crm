import { createHash } from "node:crypto";

// A React key for a signed-in frame. React sends keys to the browser, so this is a one-way hash and
// never the raw ids. Server only.
export function frameKey(userId: string, tenantId: string): string {
  return createHash("sha256").update(JSON.stringify([userId, tenantId])).digest("base64url").slice(0, 22);
}
