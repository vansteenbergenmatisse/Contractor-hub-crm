import CryptoJS from "crypto-js";
import { describe, expect, it } from "vitest";
import { decryptUserContext, resolveEmbedAccess, type EmbedCandidate, type EmbedTenant, type UserContext } from "@/features/embed";

const ctx: UserContext = { email: "pat@x.test", activeLocation: "loc_1", companyId: "co_1" };
const owner: EmbedCandidate = { userId: "u1", role: "owner", disabledAt: null, tenant: { status: "connected", companyId: "co_1" } };
const tenant: EmbedTenant = { tenantId: "t1", status: "connected", companyId: "co_1" };
const run = (c: UserContext, candidate: EmbedCandidate | null, t: EmbedTenant | null) =>
  resolveEmbedAccess(c, { findCandidate: async () => candidate, findTenant: async () => t });

describe("resolveEmbedAccess", () => {
  it("signs in an existing user without looking at the tenant", async () => {
    let asked = false;
    const out = await resolveEmbedAccess(ctx, { findCandidate: async () => owner, findTenant: async () => ((asked = true), null) });
    expect(out).toEqual({ kind: "user", userId: "u1" });
    expect(asked).toBe(false);
  });

  it("asks to create the user when the sub-account is installed and connected but the person has no account", async () => {
    expect(await run(ctx, null, tenant)).toEqual({ kind: "provision", tenantId: "t1" });
  });

  it("denies with a clear reason only when the location is not installed", async () => {
    expect(await run(ctx, null, null)).toEqual({ kind: "denied", reason: "location_not_installed" });
  });

  it.each([
    ["uninstalled", "tenant_uninstalled"],
    ["needs_reconnect", "tenant_needs_reconnect"],
  ] as const)("denies a %s tenant with its own reason", async (status, reason) => {
    expect(await run(ctx, null, { ...tenant, status })).toEqual({ kind: "denied", reason });
    expect(await run(ctx, { ...owner, tenant: { status, companyId: "co_1" } }, null)).toEqual({ kind: "denied", reason });
  });

  it("denies a company mismatch, for an existing user and for a new one", async () => {
    expect(await run({ ...ctx, companyId: "other" }, owner, null)).toEqual({ kind: "denied", reason: "company_mismatch" });
    expect(await run({ ...ctx, companyId: "other" }, null, tenant)).toEqual({ kind: "denied", reason: "company_mismatch" });
  });

  it("compares the company only when both sides have one", async () => {
    expect((await run({ ...ctx, companyId: undefined }, null, tenant)).kind).toBe("provision");
    expect((await run(ctx, null, { ...tenant, companyId: null })).kind).toBe("provision");
  });

  it("denies a disabled user and a role that may not use the app", async () => {
    expect(await run(ctx, { ...owner, disabledAt: new Date() }, tenant)).toEqual({ kind: "denied", reason: "user_disabled" });
    expect(await run(ctx, { ...owner, role: "admin" }, tenant)).toEqual({ kind: "denied", reason: "role_not_allowed" });
  });

  it("denies with lookup_failed when the database throws", async () => {
    const out = await resolveEmbedAccess(ctx, { findCandidate: async () => { throw new Error("db"); }, findTenant: async () => null });
    expect(out).toEqual({ kind: "denied", reason: "lookup_failed" });
  });
});

describe("decrypt: the documented payload shape", () => {
  // The location sample of HighLevel's user-context docs (hl-api-notes.md): an agency-typed payload
  // that carries activeLocation, plus fields the CRM ignores. Encrypted the way the docs decrypt it
  // (CryptoJS passphrase mode). A real captured payload is still to be tested on staging.
  const sample = {
    userId: "u_1", companyId: "co_1", role: "admin", type: "agency", userName: "Pat Lee", email: "Pat@Example.test",
    isAgencyOwner: false, region: "us", versionId: "v1", appStatus: "live", activeLocation: "loc_1",
    whitelabelDetails: { domain: "crm.example.test", logoUrl: "https://example.test/l.png" },
  };
  it("reads the sub-account, company and role, lower-cases the email and drops unknown keys", () => {
    const encrypted = CryptoJS.AES.encrypt(JSON.stringify(sample), "shared-secret-1").toString();
    expect(decryptUserContext(encrypted, "shared-secret-1")).toEqual({
      email: "pat@example.test", activeLocation: "loc_1", userId: "u_1", companyId: "co_1", role: "admin", type: "agency",
    });
  });
});
