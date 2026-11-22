import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { frameKey } from "@/shared/lib/frame-key";

// src/app may not be imported from a test (eslint boundary rule), so this reads the layout's source.
const layout = readFileSync(join(process.cwd(), "src/app/(app)/layout.tsx"), "utf8");

describe("the frame belongs to one signed-in user and tenant", () => {
  it("keys AppShell by an opaque key of user and tenant", () => {
    expect(layout).toMatch(/<AppShell\s+key=\{frameKey\(user\.id, user\.tenantId\)\}/);
  });
  it("never contains the ids, because React sends the key to the browser", () => {
    const key = frameKey("user-abc123", "tenant-xyz789");
    expect(key).not.toContain("user-abc123");
    expect(key).not.toContain("tenant-xyz789");
  });
  it("is stable for one pair and changes with the user or the tenant", () => {
    expect(frameKey("u1", "t1")).toBe(frameKey("u1", "t1"));
    expect(frameKey("u2", "t1")).not.toBe(frameKey("u1", "t1"));
    expect(frameKey("u1", "t2")).not.toBe(frameKey("u1", "t1"));
    expect(frameKey("a:b", "c")).not.toBe(frameKey("a", "b:c"));
  });
});
