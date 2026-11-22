import { describe, expect, it } from "vitest";
import nextConfig from "../../next.config";
import { frameHeaders } from "@/shared/config/frame-headers";

// Same route-syntax reading as tests/shared/config/frame-headers.test.ts, plus `/:path*`.
const toRegExp = (source: string) =>
  new RegExp(`^${source.replace(/:\w+\(([^)]*)\)/g, "($1)").replace(/\/:\w+\*/g, "(?:/.*)?")}$`);

async function headersFor(path: string) {
  const rules = (await nextConfig.headers!()) as { source: string; headers: { key: string; value: string }[] }[];
  return rules.filter((rule) => toRegExp(rule.source).test(path)).flatMap((rule) => rule.headers);
}

describe("next.config headers", () => {
  it.each(["/", "/embed", "/inbox/abc", "/sign-in", "/admin/clients", "/api/health/db", "/api/manifest"])(
    "sends nosniff and a strict referrer policy on %s",
    async (path) => {
      const headers = await headersFor(path);
      expect(headers.filter((h) => h.key === "X-Content-Type-Options").map((h) => h.value)).toEqual(["nosniff"]);
      expect(headers.filter((h) => h.key === "Referrer-Policy").map((h) => h.value)).toEqual(["strict-origin-when-cross-origin"]);
    },
  );

  it("keeps every frame-headers rule unchanged, so HighLevel can still embed the app", async () => {
    const rules = await nextConfig.headers!();
    for (const rule of frameHeaders()) expect(rules).toContainEqual(rule);
  });

  it("still gives each path exactly one Content-Security-Policy", async () => {
    for (const path of ["/", "/embed", "/sign-in", "/api/health/db"]) {
      expect((await headersFor(path)).filter((h) => h.key === "Content-Security-Policy"), path).toHaveLength(1);
    }
  });
});
