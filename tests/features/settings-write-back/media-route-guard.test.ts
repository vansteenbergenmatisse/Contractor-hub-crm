import { beforeEach, describe, expect, it, vi } from "vitest";

// A synthetic layout guard: no real image key sits in a protected folder today, so the route's folder
// check is driven through a stubbed writeGuardOf. Every other settings rule is the real one.
vi.mock("@/features/settings", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/features/settings")>();
  return {
    ...real,
    writeGuardOf: (key: string) =>
      key === "residentialservice1_image" ? { kind: "folder" as const, folder: "res" }
        : key === "page_hero" ? { kind: "read-only" as const }
          : real.writeGuardOf(key),
  };
});

import { handleMediaReplace, type MediaRouteDeps } from "@/features/settings-write-back";
import { lossy } from "./webp-fixtures";

const ORIGIN = "https://app.example.test";
const OWNER = { id: "U1", role: "owner" as const, tenantId: "T1" };
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><path d="M0 0"/></svg>';
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function form(fields: Record<string, string | Blob>) {
  const body = new FormData();
  for (const [name, value] of Object.entries(fields)) body.append(name, value);
  return body;
}
const webp = () => new Blob([lossy(100, 100) as BlobPart], { type: "image/webp" });
const post = (body: BodyInit, origin = ORIGIN) => new Request(`${ORIGIN}/api/settings/media`, { method: "POST", headers: { origin }, body });

function deps(over: Partial<MediaRouteDeps> = {}) {
  return {
    appOrigin: ORIGIN,
    currentUser: vi.fn<MediaRouteDeps["currentUser"]>(async () => OWNER),
    isEnabled: vi.fn<MediaRouteDeps["isEnabled"]>(() => true),
    hit: vi.fn<MediaRouteDeps["hit"]>(async () => true),
    replace: vi.fn<MediaRouteDeps["replace"]>(async () => ({ status: "saved", url: "https://files.leadconnectorhq.com/x" })),
    ...over,
  };
}
const send = (d: MediaRouteDeps, fields: Record<string, string | Blob>) => handleMediaReplace(post(form(fields)), d);

beforeEach(() => { vi.spyOn(console, "error").mockImplementation(() => {}); });

describe("POST /api/settings/media: a protected folder's image key", () => {
  const KEY = "residentialservice1_image";

  it("refuses it with no unlock", async () => {
    const d = deps();
    expect((await send(d, { key: KEY, expected: "", file: webp() })).status).toBe(400);
    expect(d.replace).not.toHaveBeenCalled();
  });

  it("refuses it with another folder's unlock", async () => {
    const d = deps();
    expect((await send(d, { key: KEY, expected: "", file: webp(), unlock: "com" })).status).toBe(400);
    expect(d.replace).not.toHaveBeenCalled();
  });

  it("passes the right unlock on to the replace", async () => {
    const d = deps();
    expect((await send(d, { key: KEY, expected: "", file: webp(), unlock: "res" })).status).toBe(200);
    expect(d.replace).toHaveBeenCalledWith(expect.objectContaining({ key: KEY, unlocked: "res", tenantId: "T1" }));
  });

  it("refuses a read-only image key with any unlock", async () => {
    const d = deps();
    expect((await send(d, { key: "page_hero", expected: "", file: webp(), unlock: "res" })).status).toBe(400);
    expect((await send(d, { key: "page_hero", expected: "", file: webp() })).status).toBe(400);
    expect(d.replace).not.toHaveBeenCalled();
  });
});

describe("POST /api/settings/media: an empty value is refused like any other for the wrong caller", () => {
  const body = () => ({ key: "partner1_logo", expected: "", file: webp() });

  it("refuses no session (401), an admin, View as client and a foreign origin (403)", async () => {
    expect((await send(deps({ currentUser: async () => null }), body())).status).toBe(401);
    expect((await send(deps({ currentUser: async () => ({ ...OWNER, role: "admin" as const }) }), body())).status).toBe(403);
    expect((await send(deps({ currentUser: async () => ({ ...OWNER, viewing: true }) }), body())).status).toBe(403);
    const d = deps();
    expect((await handleMediaReplace(post(form(body()), "https://evil.test"), d)).status).toBe(403);
    expect(d.replace).not.toHaveBeenCalled();
  });

  it("answers 404 for an excluded tenant and does no work", async () => {
    const d = deps({ isEnabled: () => false });
    expect((await send(d, body())).status).toBe(404);
    expect(d.replace).not.toHaveBeenCalled();
    expect(d.hit).not.toHaveBeenCalled();
  });

  it("refuses a form that names a tenant", async () => {
    const d = deps();
    expect((await send(d, { ...body(), tenantId: "T2" })).status).toBe(400);
    expect(d.replace).not.toHaveBeenCalled();
  });
});

describe("POST /api/settings/media: adversarial bytes", () => {
  const polyglot = () => new Blob([new Uint8Array([...PNG_MAGIC, ...new TextEncoder().encode(SVG)])]);

  it.each([false, true])("refuses PNG magic with an SVG body on the logo (photos allowed: %s)", async (logoAcceptsPhoto) => {
    const d = deps({ logoAcceptsPhoto });
    expect((await send(d, { key: "business_logo", expected: "", file: polyglot() })).status).toBe(400);
    expect(d.replace).not.toHaveBeenCalled();
  });

  it("refuses SVG bytes for a photo key", async () => {
    const d = deps();
    expect((await send(d, { key: "partner1_logo", expected: "", file: new Blob([SVG], { type: "image/svg+xml" }) })).status).toBe(400);
    expect(d.replace).not.toHaveBeenCalled();
  });

  it("refuses a RIFF/WEBP header with a broken body", async () => {
    const d = deps();
    const broken = new Blob([new TextEncoder().encode("RIFF\u0010\u0000\u0000\u0000WEBPVP8 junk")]);
    expect((await send(d, { key: "partner1_logo", expected: "", file: broken })).status).toBe(400);
    expect(d.replace).not.toHaveBeenCalled();
  });
});
