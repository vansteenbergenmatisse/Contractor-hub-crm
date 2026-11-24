import sharp from "sharp";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MediaLibrary } from "@/features/highlevel";
import { compressToWebp, createImageCopier, folderPath, MAX_IMAGE_BYTES, type ImageCopyDeps } from "@/features/template-copy";

const URL_T = "https://files.leadconnectorhq.com/jcr/logo-file";
const png = (width: number, height: number) => sharp({ create: { width, height, channels: 3, background: "#336699" } }).png().toBuffer().then((b) => new Uint8Array(b));

function deps(over: Partial<ImageCopyDeps> = {}) {
  const templateLib: MediaLibrary = {
    ok: true,
    folders: [{ id: "tf1", name: "Brand", parentId: null }, { id: "tf2", name: "Logos", parentId: "tf1" }],
    files: [{ id: "t1", name: "logo.png", url: URL_T, parentId: "tf2" }],
  };
  const targetLib: MediaLibrary = { ok: true, folders: [{ id: "gf1", name: "Brand", parentId: null }], files: [] };
  const d: ImageCopyDeps = {
    templateLibrary: vi.fn(async () => templateLib),
    targetLibrary: vi.fn(async () => targetLib),
    createFolder: vi.fn(async () => ({ kind: "created" as const, id: "gf2" })),
    upload: vi.fn(async () => ({ kind: "uploaded" as const, fileId: "nf", url: "https://files.leadconnectorhq.com/client/new" })),
    fetchBytes: vi.fn(async () => png(10, 10)),
    compress: compressToWebp,
    checkSvg: (bytes) => ({ ok: true, bytes }),
    isAllowedHost: (url) => url.startsWith("https://files.leadconnectorhq.com/"),
    ...over,
  };
  return { d, targetLib };
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("folderPath", () => {
  it("names folders from the top down, and refuses a broken chain", () => {
    const folders = [{ id: "a", name: "A", parentId: null }, { id: "b", name: "B", parentId: "a" }];
    expect(folderPath(folders, "b")).toEqual(["A", "B"]);
    expect(folderPath(folders, null)).toEqual([]);
    expect(folderPath(folders, "zz")).toBeNull();
  });
});

describe("createImageCopier", () => {
  it("reuses a file with the same name in the same folder path of the target", async () => {
    const { d, targetLib } = deps();
    if (targetLib.ok) {
      targetLib.folders.push({ id: "gf2", name: "Logos", parentId: "gf1" });
      targetLib.files.push({ id: "g1", name: "logo.webp", url: "https://files.leadconnectorhq.com/client/existing", parentId: "gf2" });
    }
    expect(await createImageCopier(d)(URL_T)).toEqual({ kind: "reused", url: "https://files.leadconnectorhq.com/client/existing" });
    expect(d.fetchBytes).not.toHaveBeenCalled();
    expect(d.upload).not.toHaveBeenCalled();
  });

  it("downloads, makes WebP, creates the missing folder and uploads into it", async () => {
    const { d } = deps();
    expect(await createImageCopier(d)(URL_T)).toEqual({ kind: "uploaded", url: "https://files.leadconnectorhq.com/client/new" });
    expect(d.createFolder).toHaveBeenCalledTimes(1);
    expect(d.createFolder).toHaveBeenCalledWith("Logos", "gf1");
    const sent = vi.mocked(d.upload).mock.calls[0][0];
    expect(sent).toMatchObject({ name: "logo.webp", fileName: "logo.webp", contentType: "image/webp", parentId: "gf2" });
    expect((await sharp(Buffer.from(sent.bytes)).metadata()).format).toBe("webp");
  });

  it("keeps an SVG as SVG after the safety check, and refuses an unsafe one", async () => {
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>');
    const { d } = deps({ fetchBytes: vi.fn(async () => svg) });
    expect((await createImageCopier(d)(URL_T)).kind).toBe("uploaded");
    expect(vi.mocked(d.upload).mock.calls[0][0]).toMatchObject({ contentType: "image/svg+xml", fileName: "logo.svg" });
    const bad = deps({ fetchBytes: vi.fn(async () => svg), checkSvg: () => ({ ok: false }) });
    expect(await createImageCopier(bad.d)(URL_T)).toEqual({ kind: "image_failed" });
    expect(bad.d.upload).not.toHaveBeenCalled();
  });

  it("reports media permission when the target's library answers 403, and uploads nothing", async () => {
    const { d } = deps({ targetLibrary: vi.fn(async () => ({ ok: false as const, reason: "permission" as const })) });
    expect(await createImageCopier(d)(URL_T)).toEqual({ kind: "needs_media_permission" });
    const up = deps({ upload: vi.fn(async () => ({ kind: "permission" as const })) });
    expect(await createImageCopier(up.d)(URL_T)).toEqual({ kind: "needs_media_permission" });
  });

  it("refuses a host that is not allowed, and a file that is not an image", async () => {
    const { d } = deps();
    expect(await createImageCopier(d)("https://evil.test/logo.png")).toEqual({ kind: "image_host_not_allowed" });
    const text = deps({ fetchBytes: vi.fn(async () => new TextEncoder().encode("not an image")) });
    expect(await createImageCopier(text.d)(URL_T)).toEqual({ kind: "not_an_image" });
  });

  it("reads each library once per batch", async () => {
    const { d } = deps();
    const copy = createImageCopier(d);
    await copy(URL_T);
    await copy(URL_T);
    expect(d.templateLibrary).toHaveBeenCalledTimes(1);
    expect(d.targetLibrary).toHaveBeenCalledTimes(1);
    // The second copy finds the file the first one uploaded.
    expect(d.upload).toHaveBeenCalledTimes(1);
  });
});

describe("compressToWebp", () => {
  it("keeps the longest side at most 2400 px and the file under 2 MB", async () => {
    const out = await compressToWebp(await png(3000, 1000));
    expect(out).not.toBeNull();
    expect(out?.width).toBe(2400);
    expect(out?.height).toBe(800);
    expect(out!.bytes.byteLength).toBeLessThanOrEqual(MAX_IMAGE_BYTES);
  });

  it("never enlarges, and refuses bytes that are not an image", async () => {
    expect((await compressToWebp(await png(20, 10)))?.width).toBe(20);
    expect(await compressToWebp(new TextEncoder().encode("<html>"))).toBeNull();
  });
});
