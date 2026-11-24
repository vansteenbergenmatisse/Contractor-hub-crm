import { beforeEach, describe, expect, it, vi } from "vitest";
import { handleMediaReplace, type MediaRouteDeps } from "@/features/settings-write-back";
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
const post = (body: BodyInit) => new Request(`${ORIGIN}/api/settings/media`, { method: "POST", headers: { origin: ORIGIN }, body });

function deps(over: Pick<MediaRouteDeps, "logoAcceptsPhoto"> = {}) {
  return {
    appOrigin: ORIGIN,
    currentUser: vi.fn(async () => OWNER),
    isEnabled: vi.fn(() => true),
    hit: vi.fn(async () => true),
    ...over,
    replace: vi.fn<MediaRouteDeps["replace"]>(async () => ({ status: "saved", url: "https://files.leadconnectorhq.com/x" })),
  } satisfies MediaRouteDeps;
}
type Sent = { key: string; expected: string; unlocked?: string; file: { contentType: string; extension: string } };
const sent = (d: ReturnType<typeof deps>) => (d.replace.mock.calls as unknown as [Sent][])[0][0];

beforeEach(() => { vi.spyOn(console, "error").mockImplementation(() => {}); });

describe("POST /api/settings/media: every image key, the same rule as the page", () => {
  it.each(["partner1_logo", "review2_photo", "team1_photo", "home_hero"])("accepts a photo for %s with an empty current value", async (key) => {
    const d = deps();
    const response = await handleMediaReplace(post(form({ key, expected: "", file: webp() })), d);
    expect(response.status).toBe(200);
    expect(sent(d)).toMatchObject({ key, expected: "" });
  });

  it("still refuses a key that is not an image", async () => {
    const d = deps();
    expect((await handleMediaReplace(post(form({ key: "business_name", expected: "", file: webp() })), d)).status).toBe(400);
    expect(d.replace).not.toHaveBeenCalled();
  });
});

describe("POST /api/settings/media: the protected folder's unlock", () => {
  it("passes a well-formed unlock on to the replace", async () => {
    const d = deps();
    const response = await handleMediaReplace(post(form({ key: "partner1_logo", expected: "", file: webp(), unlock: "res" })), d);
    expect(response.status).toBe(200);
    expect(sent(d).unlocked).toBe("res");
  });

  it("leaves it out when none was sent", async () => {
    const d = deps();
    await handleMediaReplace(post(form({ key: "partner1_logo", expected: "", file: webp() })), d);
    expect(sent(d)).not.toHaveProperty("unlocked");
  });

  it.each(["", "Res", "../x", "a".repeat(41)])("refuses the unlock %j", async (unlock) => {
    const d = deps();
    expect((await handleMediaReplace(post(form({ key: "partner1_logo", expected: "", file: webp(), unlock })), d)).status).toBe(400);
    expect(d.replace).not.toHaveBeenCalled();
  });
});

describe("POST /api/settings/media: logo and favicon may take a photo once the user's decision is switched on", () => {
  it.each(["business_logo", "business_favicon_url"])("accepts a WebP for %s when photos are allowed", async (key) => {
    const d = deps({ logoAcceptsPhoto: true });
    const response = await handleMediaReplace(post(form({ key, expected: "", file: webp() })), d);
    expect(response.status).toBe(200);
    expect(sent(d).file).toMatchObject({ contentType: "image/webp", extension: "webp" });
  });

  it("still checks and keeps an SVG logo as SVG when photos are allowed", async () => {
    const d = deps({ logoAcceptsPhoto: true });
    await handleMediaReplace(post(form({ key: "business_logo", expected: "", file: new Blob([SVG], { type: "image/svg+xml" }) })), d);
    expect(sent(d).file).toMatchObject({ contentType: "image/svg+xml", extension: "svg" });
  });

  it("still refuses an unsafe SVG logo when photos are allowed", async () => {
    const d = deps({ logoAcceptsPhoto: true });
    const bad = new Blob(['<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>'], { type: "image/svg+xml" });
    expect(await (await handleMediaReplace(post(form({ key: "business_logo", expected: "", file: bad })), d)).json()).toEqual({ error: "invalid", reason: "svg_unsafe" });
  });

  it("refuses a broken PNG on the logo by its bytes when photos are allowed", async () => {
    const d = deps({ logoAcceptsPhoto: true });
    const broken = new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3])]);
    expect((await handleMediaReplace(post(form({ key: "business_logo", expected: "", file: broken })), d)).status).toBe(400);
    expect(d.replace).not.toHaveBeenCalled();
  });
});
