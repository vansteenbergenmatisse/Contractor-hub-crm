import { describe, expect, it } from "vitest";
import { parseRetryAfter } from "@/shared/lib/retry-after";

const now = Date.UTC(2026, 10, 23, 12, 0, 0);

describe("parseRetryAfter", () => {
  it("reads whole seconds", () => {
    expect(parseRetryAfter("30", now)).toBe(30);
    expect(parseRetryAfter(" 0 ", now)).toBe(0);
  });
  it("reads an HTTP date as seconds from now", () => {
    expect(parseRetryAfter("Mon, 23 Nov 2026 12:01:00 GMT", now)).toBe(60);
  });
  it("rounds a part of a second up, so a wait is never cut short", () => {
    expect(parseRetryAfter("Mon, 23 Nov 2026 12:01:00 GMT", now + 500)).toBe(60);
  });
  it("treats a date in the past as zero", () => {
    expect(parseRetryAfter("Mon, 23 Nov 2026 11:00:00 GMT", now)).toBe(0);
  });
  it("returns null for a missing or unusable value", () => {
    for (const value of [null, undefined, "", "soon", "-5", "1.5", "99999999999999999999"]) {
      expect(parseRetryAfter(value, now)).toBeNull();
    }
  });
});
