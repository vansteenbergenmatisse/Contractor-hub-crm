import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { handleMediaReplace, isMediaReplaceEnabled, type MediaRouteDeps } from "@/features/settings-write-back";
import { lossy } from "./webp-fixtures";

const ORIGIN = "https://app.example.test";
const OWNER = { id: "U1", role: "owner" as const, tenantId: "T1" };
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><path d="M0 0"/></svg>';

function form(fields: Record<string, string | Blob>) {
  const body = new FormData();
  for (const [name, value] of Object.entries(fields)) body.append(name, value);
  return body;
}
const webp = () => new Blob([lossy(100, 100) as BlobPart], { type: "image/webp" });
const good = () => form({ key: "1_our_work_after", expected: "https://a.test/o.webp", file: webp() });
const post = (body: BodyInit, headers: Record<string, string> = { origin: ORIGIN }) => new Request(`${ORIGIN}/api/settings/media`, { method: "POST", headers, body });

function deps(over: Partial<Omit<MediaRouteDeps, "replace">> & { replace?: Mock<MediaRouteDeps["replace"]> } = {}) {
  const replace = over.replace ?? vi.fn<MediaRouteDeps["replace"]>(async () => ({ status: "saved", url: "https://files.leadconnectorhq.com/x" }));
  return {
    appOrigin: ORIGIN,
    currentUser: vi.fn(async () => OWNER),
    isEnabled: vi.fn(() => true),
    hit: vi.fn(async () => true),
    ...over,
    replace,
  } satisfies MediaRouteDeps;
}

beforeEach(() => { vi.spyOn(console, "error").mockImplementation(() => {}); });

describe("POST /api/settings/media: who may call it", () => {
  it("accepts the owner and takes the tenant from the session only", async () => {
    const d = deps();
    const response = await handleMediaReplace(post(good()), d);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "saved", url: "https://files.leadconnectorhq.com/x" });
    expect(d.replace).toHaveBeenCalledWith(expect.objectContaining({ tenantId: "T1", actorId: "U1", key: "1_our_work_after" }));
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it.each([[undefined], ["https://evil.test"], ["https://app.example.test.evil.test"], ["null"]])("refuses origin %s", async (origin) => {
    const d = deps();
    const response = await handleMediaReplace(post(good(), origin ? { origin } : {}), d);
    expect(response.status).toBe(403);
    expect(d.currentUser).not.toHaveBeenCalled();
  });

  it("refuses without a session", async () => {
    const d = deps({ currentUser: vi.fn(async () => null) });
    expect((await handleMediaReplace(post(good()), d)).status).toBe(401);
  });

  it.each([
    ["an admin", { id: "A", role: "admin" as const, tenantId: null }],
    ["an admin in View as client", { id: "A", role: "admin" as const, tenantId: "T1", viewing: true }],
    ["a session marked as viewing", { ...OWNER, viewing: true }],
    ["office staff", { id: "O", role: "office" as const, tenantId: "T1" }],
    ["an owner with no tenant", { id: "U", role: "owner" as const, tenantId: null }],
  ])("refuses %s", async (_name, user) => {
    const d = deps({ currentUser: vi.fn(async () => user) });
    expect((await handleMediaReplace(post(good()), d)).status).toBe(403);
    expect(d.replace).not.toHaveBeenCalled();
  });

  it("answers as if it does not exist when the flag is off", async () => {
    const d = deps({ isEnabled: vi.fn(() => false) });
    expect((await handleMediaReplace(post(good()), d)).status).toBe(404);
    expect(d.hit).not.toHaveBeenCalled();
  });

  it("rate limits per user and per tenant before reading the body", async () => {
    const d = deps({ hit: vi.fn(async (key: string) => !key.includes("tenant")) });
    expect((await handleMediaReplace(post(good()), d)).status).toBe(429);
    expect(d.hit).toHaveBeenCalledWith("settings-media-user:U1", expect.any(Number), expect.any(Number), expect.any(Date));
    expect(d.hit).toHaveBeenCalledWith("settings-media-tenant:T1", expect.any(Number), expect.any(Number), expect.any(Date));
    expect(d.replace).not.toHaveBeenCalled();
  });

  it("fails closed when the limiter fails", async () => {
    const d = deps({ hit: vi.fn(async () => { throw new Error("db"); }) });
    expect((await handleMediaReplace(post(good()), d)).status).toBe(429);
  });
});

describe("POST /api/settings/media: what it accepts", () => {
  const replaceCalled = async (body: BodyInit) => {
    const d = deps();
    const response = await handleMediaReplace(post(body), d);
    return { response, called: d.replace.mock.calls.length > 0 };
  };

  it("refuses a tenant id in the form", async () => {
    const body = good();
    body.append("tenantId", "T2");
    const { response, called } = await replaceCalled(body);
    expect(response.status).toBe(400);
    expect(called).toBe(false);
  });

  it.each(["business_phone_number", "0_webhook_url_form", "business_website_url", "1_our_work_token", "100_our_work_before", "../x"])("refuses key %s", async (key) => {
    const { response, called } = await replaceCalled(form({ key, expected: "", file: webp() }));
    expect(response.status).toBe(400);
    expect(called).toBe(false);
  });

  it("refuses a body that is not multipart", async () => {
    const { response } = await replaceCalled("{}");
    expect(response.status).toBe(400);
  });

  it("refuses a missing file and a file sent as text", async () => {
    expect((await replaceCalled(form({ key: "1_our_work_after", expected: "" }))).response.status).toBe(400);
    expect((await replaceCalled(form({ key: "1_our_work_after", expected: "", file: "text" }))).response.status).toBe(400);
  });

  it("refuses a body over the limit without reading it all", async () => {
    const big = new Blob([new Uint8Array(3 * 1024 * 1024)]);
    const { response, called } = await replaceCalled(form({ key: "1_our_work_after", expected: "", file: big }));
    expect(response.status).toBe(413);
    expect(called).toBe(false);
  });

  it("trusts the bytes and not the browser's type: a PNG labelled WebP is refused", async () => {
    const fake = new Blob([new Uint8Array(40).fill(0x41)], { type: "image/webp" });
    const { response, called } = await replaceCalled(form({ key: "1_our_work_after", expected: "", file: fake }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid", reason: "wrong_type" });
    expect(called).toBe(false);
  });

  it("requires an SVG for the logo and favicon", async () => {
    for (const key of ["business_logo", "business_favicon_url"]) {
      const { response, called } = await replaceCalled(form({ key, expected: "", file: webp() }));
      expect(await response.json()).toEqual({ error: "invalid", reason: "svg_required" });
      expect(called).toBe(false);
    }
  });

  it("refuses an unsafe SVG logo", async () => {
    const bad = new Blob(['<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>'], { type: "image/svg+xml" });
    const { response, called } = await replaceCalled(form({ key: "business_logo", expected: "", file: bad }));
    expect(await response.json()).toEqual({ error: "invalid", reason: "svg_unsafe" });
    expect(called).toBe(false);
  });

  it("names the SVG problem in a header, as a fixed code", async () => {
    const bad = new Blob(['<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'], { type: "image/svg+xml" });
    const { response } = await replaceCalled(form({ key: "business_logo", expected: "", file: bad }));
    expect(response.headers.get("x-svg-problem")).toBe("script");
  });

  it("refuses a broken PNG on a photo field by its bytes", async () => {
    const bad = new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3])], { type: "image/png" });
    const { response, called } = await replaceCalled(form({ key: "1_our_work_after", expected: "", file: bad }));
    expect(await response.json()).toEqual({ error: "invalid", reason: "wrong_type" });
    expect(called).toBe(false);
  });

  it("refuses an SVG for a photo field", async () => {
    const svg = new Blob([SVG], { type: "image/svg+xml" });
    const { response, called } = await replaceCalled(form({ key: "business_main_background_video_or_image", expected: "", file: svg }));
    expect(response.status).toBe(400);
    expect(called).toBe(false);
  });

  it("passes the checked SVG on as the serialized tree", async () => {
    const d = deps();
    const file = new Blob([`<!-- x -->${SVG}`], { type: "text/plain" });
    await handleMediaReplace(post(form({ key: "business_logo", expected: "https://a.test/old.png", file })), d);
    const input = (d.replace.mock.calls as unknown as [{ expected: string; file: { bytes: Uint8Array; contentType: string; extension: string } }][])[0][0];
    expect(input.expected).toBe("https://a.test/old.png");
    expect(input.file.contentType).toBe("image/svg+xml");
    expect(input.file.extension).toBe("svg");
    expect(new TextDecoder().decode(input.file.bytes)).not.toContain("<!--");
  });

  it("gives a plain failure when the replace throws", async () => {
    const d = deps({ replace: vi.fn<MediaRouteDeps["replace"]>(async () => { throw new Error("boom secret"); }) });
    const response = await handleMediaReplace(post(good()), d).catch(() => new Response(null, { status: 599 }));
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("secret");
  });
});

describe("isMediaReplaceEnabled", () => {
  it("is off unless ENABLED is exactly true and the exact tenant is listed", () => {
    expect(isMediaReplaceEnabled("T1", {})).toBe(false);
    expect(isMediaReplaceEnabled("T1", { SETTINGS_MEDIA_REPLACE_ENABLED: "true" })).toBe(false);
    expect(isMediaReplaceEnabled("T1", { SETTINGS_MEDIA_REPLACE_TENANTS: "T1" })).toBe(false);
    expect(isMediaReplaceEnabled("T1", { SETTINGS_MEDIA_REPLACE_ENABLED: "TRUE", SETTINGS_MEDIA_REPLACE_TENANTS: "T1" })).toBe(false);
    expect(isMediaReplaceEnabled("T1", { SETTINGS_MEDIA_REPLACE_ENABLED: "true", SETTINGS_MEDIA_REPLACE_TENANTS: "T2, T1" })).toBe(true);
  });

  it("has no wildcard and no partial match", () => {
    for (const list of ["*", "T", "T11", "t1", "all"]) {
      expect(isMediaReplaceEnabled("T1", { SETTINGS_MEDIA_REPLACE_ENABLED: "true", SETTINGS_MEDIA_REPLACE_TENANTS: list })).toBe(false);
    }
  });
});
