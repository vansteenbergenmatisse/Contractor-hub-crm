import { describe, expect, it } from "vitest";
import { checkWebp, MAX_IMAGE_BYTES, MAX_IMAGE_SIDE } from "../../../src/features/settings-write-back/api/webp-check";
import { lossless, lossy, riff, vp8x } from "./webp-fixtures";

describe("checkWebp", () => {
  it("reads the size of a lossy file", () => {
    expect(checkWebp(lossy(1200, 800))).toEqual({ ok: true, width: 1200, height: 800 });
  });

  it("reads the size of a lossless file", () => {
    expect(checkWebp(lossless(2400, 16))).toEqual({ ok: true, width: 2400, height: 16 });
  });

  it("reads the size of an extended file", () => {
    expect(checkWebp(vp8x(640, 480))).toEqual({ ok: true, width: 640, height: 480 });
  });

  it.each([
    ["lossy", () => lossy(MAX_IMAGE_SIDE + 1, 10)],
    ["lossless", () => lossless(10, MAX_IMAGE_SIDE + 1)],
    ["extended", () => vp8x(MAX_IMAGE_SIDE + 1, 10)],
  ])("refuses a %s file over the longest side", (_name, make) => {
    expect(checkWebp(make())).toEqual({ ok: false, reason: "dimensions" });
  });

  it("refuses an animated file", () => {
    expect(checkWebp(vp8x(10, 10, 0x02))).toEqual({ ok: false, reason: "wrong_type" });
  });

  it("refuses a file over 2 MB", () => {
    expect(MAX_IMAGE_BYTES).toBe(2 * 1024 * 1024);
    expect(checkWebp(new Uint8Array(MAX_IMAGE_BYTES + 1))).toEqual({ ok: false, reason: "too_large" });
  });

  it.each([
    ["PNG bytes", new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])],
    ["an SVG", new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'><script/></svg>                ")],
    ["RIFF that is not WebP", (() => { const b = lossy(10, 10); b[8] = 0x41; return b; })()],
    ["a short file", new Uint8Array(8)],
    ["an unknown chunk", riff("JUNK", new Uint8Array(20))],
    ["a RIFF size that does not match", (() => { const b = lossy(10, 10); b[4] = 0xff; return b; })()],
    ["a lossy file with a bad start code", (() => { const b = lossy(10, 10); b[23] = 0; return b; })()],
    ["a lossless file with a bad signature", (() => { const b = lossless(10, 10); b[20] = 0; return b; })()],
  ])("refuses %s", (_name, file) => {
    expect(checkWebp(file)).toEqual({ ok: false, reason: "wrong_type" });
  });

  it("refuses a zero size", () => {
    expect(checkWebp(lossy(0, 10))).toEqual({ ok: false, reason: "dimensions" });
  });
});
