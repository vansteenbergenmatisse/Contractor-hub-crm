// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fitSize, MAX_PHOTO_BYTES, prepareImageFile } from "../../../src/features/settings/api/prepare-image";

function fakeCanvas(results: (quality: number) => Blob | null) {
  const canvas = { width: 0, height: 0, getContext: () => ({ drawImage: vi.fn() }), toBlob: (done: (b: Blob | null) => void, _type: string, quality: number) => done(results(quality)) };
  vi.spyOn(document, "createElement").mockReturnValue(canvas as unknown as HTMLElement);
  return canvas;
}
const photo = () => new File(["x"], "a.jpg", { type: "image/jpeg" });
const webpOf = (size: number) => new Blob([new Uint8Array(size)], { type: "image/webp" });

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => "blob:x");
  vi.stubGlobal("createImageBitmap", vi.fn(async () => ({ width: 4800, height: 2400, close: vi.fn() })));
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("fitSize", () => {
  it("limits the longest side to 2400 and never enlarges", () => {
    expect(fitSize(4800, 2400)).toEqual({ width: 2400, height: 1200 });
    expect(fitSize(2400, 4800)).toEqual({ width: 1200, height: 2400 });
    expect(fitSize(100, 50)).toEqual({ width: 100, height: 50 });
  });
});

describe("prepareImageFile", () => {
  it("makes a WebP within the limits", async () => {
    const canvas = fakeCanvas(() => webpOf(1000));
    const result = await prepareImageFile(photo(), "photo");
    expect(result.ok && result.blob.type).toBe("image/webp");
    expect(canvas.width).toBe(2400);
  });

  it.each([["png", "image/png"], ["jpeg", "image/jpeg"]] as const)("encodes to the current file's format: %s", async (format, type) => {
    const asked: string[] = [];
    const canvas = { width: 0, height: 0, getContext: () => ({ drawImage: vi.fn() }), toBlob: (done: (b: Blob | null) => void, wanted: string) => {
      asked.push(wanted);
      done(new Blob([new Uint8Array(10)], { type: wanted }));
    } };
    vi.spyOn(document, "createElement").mockReturnValue(canvas as unknown as HTMLElement);
    const result = await prepareImageFile(photo(), "photo", format);
    expect(result.ok && result.blob.type).toBe(type);
    expect(asked).toEqual([type]);
  });

  it("never sends another format when the browser cannot write the one asked for", async () => {
    fakeCanvas(() => new Blob(["x"], { type: "image/png" }));
    const result = await prepareImageFile(photo(), "photo", "jpeg");
    expect(result.ok).toBe(false);
  });

  it("lowers the quality until it fits 2 MB", async () => {
    const qualities: number[] = [];
    fakeCanvas((quality) => {
      qualities.push(quality);
      return webpOf(quality > 0.7 ? MAX_PHOTO_BYTES + 1 : 1000);
    });
    expect((await prepareImageFile(photo(), "photo")).ok).toBe(true);
    expect(qualities.length).toBeGreaterThan(1);
  });

  it("says so when the browser has no WebP encoder", async () => {
    fakeCanvas(() => new Blob(["x"], { type: "image/png" }));
    const result = await prepareImageFile(photo(), "photo");
    expect(result.ok).toBe(false);
    expect(!result.ok && result.message).toMatch(/browser/);
  });

  it("refuses a file it cannot read", async () => {
    vi.stubGlobal("createImageBitmap", vi.fn(async () => { throw new Error("bad"); }));
    expect((await prepareImageFile(photo(), "photo")).ok).toBe(false);
  });

  it("requires an SVG for the svg kind, at most 512 KB", async () => {
    expect((await prepareImageFile(photo(), "svg")).ok).toBe(false);
    expect((await prepareImageFile(new File([new Uint8Array(512 * 1024 + 1)], "a.svg", { type: "image/svg+xml" }), "svg")).ok).toBe(false);
    expect((await prepareImageFile(new File(["<svg/>"], "a.svg", { type: "image/svg+xml" }), "svg")).ok).toBe(true);
  });
});
