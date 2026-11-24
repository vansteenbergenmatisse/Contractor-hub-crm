import { beforeEach, describe, expect, it, vi } from "vitest";
import { handleTemplateCopy, type CopyPreview, type TemplateCopyRouteDeps } from "@/features/template-copy";

const ORIGIN = "https://app.example.test";
const PREVIEW: CopyPreview = {
  counts: { templateKeys: 1, fill: 1, same: 0, different: 0, missing: 0, duplicates: 0, templateBlank: 0, images: 0, hidden: 0 },
  fill: [{ key: "business_name", image: false, value: "JCR" }],
  same: [],
  different: [],
  missing: [],
  duplicates: [],
  images: [],
};

function deps(over: Partial<TemplateCopyRouteDeps> = {}) {
  return {
    adminId: vi.fn(async () => "admin-1"),
    isViewing: vi.fn(async () => false),
    limiter: vi.fn(async () => true),
    appOrigin: ORIGIN,
    config: { enabled: true, templateTenantId: "TPL" },
    preview: vi.fn(async () => ({ status: "ok" as const, preview: PREVIEW })),
    apply: vi.fn(async () => ({ status: "ok" as const, results: [], remaining: 0, done: true })),
    ...over,
  } satisfies TemplateCopyRouteDeps;
}

const post = (body: unknown, headers: Record<string, string> = { origin: ORIGIN, "content-type": "application/json" }) =>
  new Request(`${ORIGIN}/api/admin/clients/T2/copy-template`, { method: "POST", headers, body: typeof body === "string" ? body : JSON.stringify(body) });

beforeEach(() => {
  vi.spyOn(console, "info").mockImplementation(() => {});
});

describe("POST /api/admin/clients/[tenantId]/copy-template: who may call it", () => {
  it("previews for an admin, with the template from config only", async () => {
    const d = deps();
    const response = await handleTemplateCopy(post({ action: "preview" }), "T2", d);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(PREVIEW);
    expect(d.preview).toHaveBeenCalledWith({ targetTenantId: "T2", templateTenantId: "TPL" });
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it.each([[undefined], ["https://evil.test"], ["null"]])("refuses origin %s", async (origin) => {
    const d = deps();
    const response = await handleTemplateCopy(post({ action: "preview" }, origin ? { origin, "content-type": "application/json" } : { "content-type": "application/json" }), "T2", d);
    expect(response.status).toBe(403);
    expect(d.preview).not.toHaveBeenCalled();
  });

  it("refuses anyone who is not an admin", async () => {
    const d = deps({ adminId: vi.fn(async () => null) });
    expect((await handleTemplateCopy(post({ action: "preview" }), "T2", d)).status).toBe(403);
    expect(d.preview).not.toHaveBeenCalled();
  });

  it("refuses an admin in View as client, also when that check fails", async () => {
    const viewing = deps({ isViewing: vi.fn(async () => true) });
    const response = await handleTemplateCopy(post({ action: "apply" }), "T2", viewing);
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "viewing" });
    const broken = deps({ isViewing: vi.fn(async () => { throw new Error("x"); }) });
    expect((await handleTemplateCopy(post({ action: "apply" }), "T2", broken)).status).toBe(403);
    expect(viewing.apply).not.toHaveBeenCalled();
    expect(broken.apply).not.toHaveBeenCalled();
  });

  it("answers 404 while the flag is off or no template is set", async () => {
    for (const config of [{ enabled: false, templateTenantId: "TPL" }, { enabled: true, templateTenantId: null }]) {
      const d = deps({ config });
      expect((await handleTemplateCopy(post({ action: "preview" }), "T2", d)).status).toBe(404);
      expect(d.limiter).not.toHaveBeenCalled();
    }
  });

  it("is rate limited per admin and fails closed", async () => {
    const d = deps({ limiter: vi.fn(async () => false) });
    expect((await handleTemplateCopy(post({ action: "preview" }), "T2", d)).status).toBe(429);
    expect(d.limiter).toHaveBeenCalledWith("template-copy:admin-1");
    const broken = deps({ limiter: vi.fn(async () => { throw new Error("db"); }) });
    expect((await handleTemplateCopy(post({ action: "preview" }), "T2", broken)).status).toBe(429);
  });
});

describe("POST copy-template: what it accepts", () => {
  it("refuses copying the template onto itself", async () => {
    const d = deps();
    const response = await handleTemplateCopy(post({ action: "preview" }), "TPL", d);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "same_tenant" });
  });

  it.each([
    ["a template id in the body", { action: "preview", templateTenantId: "OTHER" }],
    ["a template id beside apply", { action: "apply", templateTenantId: "OTHER" }],
    ["an unknown action", { action: "delete" }],
    ["a bad key", { action: "apply", overwrite: { "a-b": "tok" } }],
    ["a bad token", { action: "apply", overwrite: { a: "x y" } }],
    ["skip not a list", { action: "apply", skip: "a" }],
  ])("refuses %s", async (_name, body) => {
    const d = deps();
    expect((await handleTemplateCopy(post(body), "T2", d)).status).toBe(400);
    expect(d.preview).not.toHaveBeenCalled();
    expect(d.apply).not.toHaveBeenCalled();
  });

  it("refuses a bad tenant id and a body that is not JSON", async () => {
    expect((await handleTemplateCopy(post({ action: "preview" }), "../x", deps())).status).toBe(400);
    expect((await handleTemplateCopy(post("nope"), "T2", deps())).status).toBe(400);
    expect((await handleTemplateCopy(post({ action: "preview" }, { origin: ORIGIN, "content-type": "text/plain" }), "T2", deps())).status).toBe(415);
  });

  it("applies with the ticked overwrites and skip list, acting as the admin", async () => {
    const d = deps();
    const response = await handleTemplateCopy(post({ action: "apply", overwrite: { business_email: "tok_1" }, skip: ["a"] }), "T2", d);
    expect(response.status).toBe(200);
    expect(d.apply).toHaveBeenCalledWith({ targetTenantId: "T2", templateTenantId: "TPL", actorId: "admin-1", overwrite: { business_email: "tok_1" }, skip: new Set(["a"]) });
  });

  it("answers 409 with the reason when a batch cannot run", async () => {
    const d = deps({ apply: vi.fn(async () => ({ status: "busy" as const })) });
    const response = await handleTemplateCopy(post({ action: "apply" }), "T2", d);
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "busy" });
  });
});
