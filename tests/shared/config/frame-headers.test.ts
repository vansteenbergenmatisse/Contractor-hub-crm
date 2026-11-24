import { describe, expect, it } from "vitest";
import { frameHeaders, HIGHLEVEL_FRAME_ANCESTORS, FRAME_DENIED_PATHS } from "@/shared/config/frame-headers";

// Which pages HighLevel may frame. After sign-in the whole app runs in the iframe, so every page
// except the sign-in, admin and API pages must allow it; those must never be framed (clickjacking).
const rules = frameHeaders();
// Next's route syntax, read as a plain regular expression: `:name(a|b)` is the group (a|b) and
// `/:rest*` is any further path. The build and the curl check in PROGRESS.md prove Next accepts them.
const toRegExp = (source: string) =>
  new RegExp(`^${source.replace(/:\w+\(([^)]*)\)/g, "($1)").replace(/\/:\w+\*/g, "(?:/.*)?")}$`);
const matches = (source: string, path: string) => toRegExp(source).test(path);
const rulesFor = (path: string) => rules.filter((rule) => matches(rule.source, path));
const header = (path: string, key: string) =>
  rulesFor(path).flatMap((rule) => rule.headers).find((h) => h.key.toLowerCase() === key.toLowerCase())?.value;

describe("frameHeaders", () => {
  it.each(["/embed", "/", "/today", "/inbox/abc"])("allows HighLevel to frame %s and sends no X-Frame-Options", (path) => {
    expect(header(path, "Content-Security-Policy")).toBe(`frame-ancestors ${HIGHLEVEL_FRAME_ANCESTORS.join(" ")}`);
    expect(header(path, "X-Frame-Options")).toBeUndefined();
  });

  it.each(["/sign-in", "/forgot-password", "/reset-password", "/invite/CODE", "/admin/clients", "/api/auth/sign-in/email", "/api/admin/invites"])(
    "refuses all framing of %s",
    (path) => {
      expect(header(path, "Content-Security-Policy")).toBe("frame-ancestors 'none'");
      expect(header(path, "X-Frame-Options")).toBe("DENY");
    },
  );

  it("gives every path exactly one frame policy, never two that disagree", () => {
    for (const path of ["/", "/embed", "/sign-in", "/admin", "/admin/clients", "/api/health/db", "/signed", "/invited", "/apiary"]) {
      const csp = rulesFor(path).flatMap((rule) => rule.headers).filter((h) => h.key === "Content-Security-Policy");
      expect(csp, path).toHaveLength(1);
    }
  });

  it("does not treat a path that only starts with a denied word as denied", () => {
    expect(header("/administration", "X-Frame-Options")).toBeUndefined();
    expect(header("/apiary", "X-Frame-Options")).toBeUndefined();
  });

  // The two hosts the build prompt names, plus the agency's white-label host where clients log in
  // (user, 2026-11-24). Nothing else, and every entry is https.
  it("allows only the HighLevel hosts and the agency's white-label host", () => {
    expect(HIGHLEVEL_FRAME_ANCESTORS).toEqual([
      "https://app.gohighlevel.com",
      "https://app.leadconnectorhq.com",
      "https://app.forgeforward.io",
    ]);
    expect(FRAME_DENIED_PATHS).toEqual(expect.arrayContaining(["sign-in", "admin", "api", "invite"]));
  });
});
