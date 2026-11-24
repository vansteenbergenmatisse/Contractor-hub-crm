import { describe, expect, it, vi } from "vitest";
import {
  createPacer,
  identityKeys,
  isImageLink,
  planCopy,
  templateCopyConfig,
  templateWarnings,
  toPreview,
  valueToken,
} from "@/features/template-copy";

const HOSTS = ["assets.cdn.filesafe.space", "files.leadconnectorhq.com"];

describe("templateCopyConfig", () => {
  it("is off unless the flag is exactly true and a template id is set", () => {
    expect(templateCopyConfig({})).toEqual({ enabled: false, templateTenantId: null });
    expect(templateCopyConfig({ TEMPLATE_COPY_ENABLED: "true" })).toEqual({ enabled: false, templateTenantId: null });
    expect(templateCopyConfig({ TEMPLATE_COPY_ENABLED: "1", TEMPLATE_TENANT_ID: "T1" })).toEqual({ enabled: false, templateTenantId: "T1" });
    expect(templateCopyConfig({ TEMPLATE_COPY_ENABLED: "true", TEMPLATE_TENANT_ID: " T1 " })).toEqual({ enabled: true, templateTenantId: "T1" });
    expect(templateCopyConfig({ TEMPLATE_COPY_ENABLED: "true", TEMPLATE_TENANT_ID: "a/b" })).toEqual({ enabled: false, templateTenantId: null });
  });
});

describe("isImageLink", () => {
  it("takes https links on media hosts or with an image extension", () => {
    expect(isImageLink("https://assets.cdn.filesafe.space/x/logo", HOSTS)).toBe(true);
    expect(isImageLink("https://example.test/a/photo.JPG", HOSTS)).toBe(true);
    expect(isImageLink("https://example.test/a/logo.svg", HOSTS)).toBe(true);
    expect(isImageLink("http://example.test/a.png", HOSTS)).toBe(false);
    expect(isImageLink("https://example.test/page", HOSTS)).toBe(false);
    expect(isImageLink("Acme Roofing", HOSTS)).toBe(false);
  });
});

describe("planCopy and toPreview", () => {
  const template = [
    { key: "business_name", value: "JCR Roofing" },
    { key: "business_phone_number", value: "555" },
    { key: "business_email", value: "a@jcr.test" },
    { key: "business_logo", value: "https://files.leadconnectorhq.com/logo" },
    { key: "zz_api_token", value: "sk-123" },
    { key: "only_template", value: "x" },
    { key: "empty_in_template", value: "  " },
    { key: "twice", value: "y" },
  ];
  const target = [
    { key: "business_name", value: "" },
    { key: "business_phone_number", value: " 555 " },
    { key: "business_email", value: "me@client.test" },
    { key: "business_logo", value: "" },
    { key: "zz_api_token", value: "sk-OTHER" },
    { key: "empty_in_template", value: "" },
  ];
  const plan = planCopy(template, target, { targetDuplicates: ["twice"], isImage: (v) => isImageLink(v, HOSTS), isSecret: (k) => k.startsWith("zz_") });

  it("sorts every template key by the target's state", () => {
    expect(Object.fromEntries(plan.map((e) => [e.key, e.state]))).toEqual({
      business_name: "fill",
      business_phone_number: "same",
      business_email: "different",
      business_logo: "fill",
      zz_api_token: "different",
      only_template: "missing",
      empty_in_template: "template_blank",
      twice: "duplicate",
    });
    expect(plan.find((e) => e.key === "business_logo")?.image).toBe(true);
  });

  it("never shows a secret-looking value, but counts it", () => {
    const preview = toPreview(plan, (key, value) => `tok-${key}-${value.length}`);
    expect(preview.counts).toEqual({ templateKeys: 8, fill: 2, same: 1, different: 2, missing: 1, duplicates: 1, templateBlank: 1, images: 1, hidden: 1 });
    expect(preview.fill).toEqual([
      { key: "business_name", image: false, value: "JCR Roofing" },
      { key: "business_logo", image: true, value: "https://files.leadconnectorhq.com/logo" },
    ]);
    expect(preview.different).toEqual([
      { key: "business_email", image: false, token: "tok-business_email-14", templateValue: "a@jcr.test", targetValue: "me@client.test" },
      { key: "zz_api_token", image: false, token: "tok-zz_api_token-8" },
    ]);
    expect(JSON.stringify(preview)).not.toContain("sk-");
    expect(preview.missing).toEqual(["only_template"]);
    expect(preview.images).toEqual(["business_logo"]);
  });
});

describe("valueToken", () => {
  it("is stable per tenant, key and trimmed value, and differs otherwise", () => {
    const a = valueToken("s", "T1", "k", "v");
    expect(valueToken("s", "T1", "k", " v ")).toBe(a);
    expect(valueToken("s", "T2", "k", "v")).not.toBe(a);
    expect(valueToken("s", "T1", "k", "w")).not.toBe(a);
    expect(valueToken("other", "T1", "k", "v")).not.toBe(a);
    expect(a).toMatch(/^[A-Za-z0-9_-]{32}$/);
  });
});

describe("createPacer", () => {
  it("spaces requests 125 ms apart and waits a burst window after a 429", async () => {
    let now = 0;
    const waits: number[] = [];
    const pacer = createPacer({ now: () => now, wait: async (ms) => { waits.push(ms); now += ms; } });
    await pacer.beforeRequest();
    await pacer.beforeRequest();
    await pacer.beforeRequest();
    expect(waits).toEqual([125, 125]);
    pacer.observeStatus(200);
    pacer.observeStatus(429);
    await pacer.beforeRequest();
    expect(waits[2]).toBe(10_000);
    expect(pacer.limitedCount()).toBe(1);
    await pacer.beforeRequest();
    expect(waits[3]).toBe(250);
  });
});

describe("templateWarnings", () => {
  const keys = identityKeys(["business_name", "business_phone_number", "business_logo", "business_hours"]);
  const values: Record<string, { key: string; value: string }[]> = {
    TPL: [
      { key: "business_name", value: "JCR" },
      { key: "business_phone_number", value: "555" },
      { key: "business_hours", value: "9-5" },
      { key: "business_logo", value: "" },
    ],
    A: [{ key: "business_name", value: "JCR " }, { key: "business_phone_number", value: "777" }, { key: "business_hours", value: "9-5" }, { key: "business_logo", value: "" }],
    B: [{ key: "business_name", value: "Own" }],
  };

  it("names identity values that equal the template's, never hours or blanks, never the template itself", async () => {
    const read = vi.fn(async (id: string) => values[id] ?? []);
    const out = await templateWarnings({ templateTenantId: "TPL", tenantIds: ["TPL", "A", "B"], keys, read, labelOf: (k) => k.toUpperCase() });
    expect(keys).not.toContain("business_hours");
    expect(out).toEqual({ A: ["BUSINESS_NAME"] });
  });

  it("shows nothing for a client that does not answer in time or fails", async () => {
    const read = vi.fn((id: string) => (id === "A" ? new Promise<never>(() => {}) : id === "B" ? Promise.reject(new Error("x")) : Promise.resolve(values[id] ?? [])));
    const out = await templateWarnings({ templateTenantId: "TPL", tenantIds: ["A", "B"], keys, read, labelOf: (k) => k, budgetMs: 20 });
    expect(out).toEqual({});
  });

  it("shows nothing when the template cannot be read", async () => {
    const read = vi.fn(async (id: string) => {
      if (id === "TPL") throw new Error("down");
      return values[id] ?? [];
    });
    expect(await templateWarnings({ templateTenantId: "TPL", tenantIds: ["A"], keys, read, labelOf: (k) => k })).toEqual({});
  });
});
