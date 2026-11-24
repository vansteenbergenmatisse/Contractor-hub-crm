import { describe, expect, it } from "vitest";
import { isMediaReplaceEnabled, isWriteBackEnabled } from "@/features/settings-write-back";

// Write-back on by default for every connected client (user decision 2026-11-24): `*_ALL` turns it on
// for every tenant, `*_EXCLUDE` takes tenants out, and `*_ENABLED` stays the kill switch. Made-up ids.
const flags = [
  { name: "write-back", check: isWriteBackEnabled, prefix: "SETTINGS_WRITE_BACK" },
  { name: "media replace", check: isMediaReplaceEnabled, prefix: "SETTINGS_MEDIA_REPLACE" },
] as const;

describe.each(flags)("$name default-on", ({ check, prefix }) => {
  const env = (vars: Record<string, string>) => Object.fromEntries(Object.entries(vars).map(([k, v]) => [`${prefix}_${k}`, v]));

  it("is on for every tenant with ALL and the kill switch", () => {
    expect(check("T1", env({ ENABLED: "true", ALL: "true" }))).toBe(true);
    expect(check("T99", env({ ENABLED: "true", ALL: "true" }))).toBe(true);
  });

  it("stays off without the kill switch, whatever ALL says", () => {
    expect(check("T1", env({ ALL: "true" }))).toBe(false);
    expect(check("T1", env({ ENABLED: "", ALL: "true" }))).toBe(false);
    expect(check("T1", env({ ENABLED: "1", ALL: "true" }))).toBe(false);
    expect(check("T1", env({ ENABLED: "TRUE", ALL: "true", TENANTS: "T1" }))).toBe(false);
  });

  it("needs ALL to be exactly true", () => {
    for (const all of ["", "1", "TRUE", "yes", "*"]) expect(check("T1", env({ ENABLED: "true", ALL: all }))).toBe(false);
  });

  it("leaves out an excluded tenant, by exact id only", () => {
    const base = { ENABLED: "true", ALL: "true" };
    expect(check("T1", env({ ...base, EXCLUDE: "T2, T1" }))).toBe(false);
    expect(check("T1", env({ ...base, EXCLUDE: "T11,t1,T" }))).toBe(true);
    expect(check("T2", env({ ...base, EXCLUDE: " T1 " }))).toBe(true);
  });

  it("lets EXCLUDE win over TENANTS, with or without ALL", () => {
    expect(check("T1", env({ ENABLED: "true", TENANTS: "T1", EXCLUDE: "T1" }))).toBe(false);
    expect(check("T1", env({ ENABLED: "true", ALL: "true", TENANTS: "T1", EXCLUDE: "T1" }))).toBe(false);
  });

  it("keeps the old per-tenant list working when ALL is not set", () => {
    expect(check("T1", env({ ENABLED: "true", TENANTS: "T1" }))).toBe(true);
    expect(check("T2", env({ ENABLED: "true", TENANTS: "T1" }))).toBe(false);
  });

  it("never turns on for an empty tenant id", () => {
    expect(check("", env({ ENABLED: "true", ALL: "true" }))).toBe(false);
    expect(check("  ", env({ ENABLED: "true", ALL: "true" }))).toBe(false);
  });
});
