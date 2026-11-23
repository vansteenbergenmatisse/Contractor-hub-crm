import { describe, expect, it } from "vitest";
import { checkWebp, MAX_IMAGE_BYTES, MAX_IMAGE_SIDE } from "../../../src/features/settings-write-back/api/webp-check";
import { CHROME_WEBP, container, iccProfile, lossless, lossy, riff, vp8Frame, vp8lFrame, vp8x, vp8xHeader } from "./webp-fixtures";

const ICC = 0x20;
const ALPHA = 0x10;
const header = (flags = 0, width = 100, height = 100) => ["VP8X", vp8xHeader(width, height, flags)] as const;
const frame = (width = 100, height = 100) => ["VP8 ", vp8Frame(width, height)] as const;
const html = new TextEncoder().encode("<html><script>alert(1)</script></html>");
const alphaData = new Uint8Array([0, 1, 2, 3]);

describe("checkWebp walks every chunk", () => {
  it.each(CHROME_WEBP)("accepts real Chrome canvas output: %s", (_name, base64) => {
    expect(checkWebp(new Uint8Array(Buffer.from(base64, "base64")))).toEqual({ ok: true, width: 8, height: 6 });
  });

  it.each([
    ["ICCP then VP8", [header(ICC), ["ICCP", iccProfile()], frame()]],
    ["ICCP, ALPH, VP8", [header(ICC | ALPHA), ["ICCP", iccProfile()], ["ALPH", alphaData], frame()]],
    ["ICCP then VP8L", [header(ICC | ALPHA), ["ICCP", iccProfile()], ["VP8L", vp8lFrame(100, 100)]]],
    ["an odd-sized ICC profile with its pad byte", [header(ICC), ["ICCP", iccProfile(129)], frame()]],
  ] as const)("accepts %s", (_name, chunks) => {
    expect(checkWebp(container(chunks))).toEqual({ ok: true, width: 100, height: 100 });
  });

  const refused: [string, Uint8Array][] = [
    ["a frame larger than the canvas", container([header(), frame(16383, 16383)])],
    ["a lossless frame unlike the canvas", container([header(), ["VP8L", vp8lFrame(101, 100)]])],
    ["the reported forged file", container([header(), frame(16383, 16383), ["ANMF", new Uint8Array(24)], ["JUNK", html]])],
    ["an ANMF chunk", container([header(), ["ANMF", new Uint8Array(24)], frame()])],
    ["an ANIM chunk", container([header(), ["ANIM", new Uint8Array(6)], frame()])],
    ["a JUNK chunk holding HTML", container([header(), frame(), ["JUNK", html]])],
    ["a JUNK chunk after a simple frame", container([frame(), ["JUNK", html]])],
    ["an EXIF chunk", container([header(0x08), frame(), ["EXIF", html]])],
    ["an XMP chunk", container([header(0x04), frame(), ["XMP ", html]])],
    ["a canvas with no frame", container([header()])],
    ["two frames", container([header(), frame(), frame()])],
    ["two VP8X chunks", container([header(), header(), frame()])],
    ["two ICCP chunks", container([header(ICC), ["ICCP", iccProfile()], ["ICCP", iccProfile()], frame()])],
    ["ICCP after the frame", container([header(ICC), frame(), ["ICCP", iccProfile()]])],
    ["ALPH after the frame", container([header(ALPHA), frame(), ["ALPH", alphaData]])],
    ["ALPH before ICCP", container([header(ICC | ALPHA), ["ALPH", alphaData], ["ICCP", iccProfile()], frame()])],
    ["ALPH with a lossless frame", container([header(ALPHA), ["ALPH", alphaData], ["VP8L", vp8lFrame(100, 100)]])],
    ["ALPH without its flag", container([header(), ["ALPH", alphaData], frame()])],
    ["ICCP without its flag", container([header(), ["ICCP", iccProfile()], frame()])],
    ["the ICC flag without ICCP", container([header(ICC), frame()])],
    ["an ICCP that is not a profile", container([header(ICC), ["ICCP", html], frame()])],
    ["an ICCP with the wrong declared size", (() => { const p = iccProfile(); p[3] = 200; return container([header(ICC), ["ICCP", p], frame()]); })()],
    ["an ICCP over the size cap", container([header(ICC), ["ICCP", iccProfile(4097)], frame()])],
    ["a reserved VP8X flag", container([header(0x80), frame()])],
    ["a VP8X of the wrong length", container([["VP8X", new Uint8Array(16)], frame()])],
    ["a VP8 inter frame", (() => { const f = vp8Frame(100, 100); f[0] = 1; return container([["VP8 ", f]]); })()],
    ["a chunk size past the end", (() => { const b = lossy(10, 10); new DataView(b.buffer).setUint32(16, 0xffffffff, true); return b; })()],
    ["a chunk cut short", (() => { const b = container([header(), frame()]); new DataView(b.buffer).setUint32(38, 17, true); return b; })()],
    ["a non-zero pad byte", (() => { const b = container([header(ICC), ["ICCP", iccProfile(129)], frame()]); b[12 + 18 + 8 + 129] = 7; return b; })()],
    ["trailing bytes too short for a chunk", (() => { const b = new Uint8Array(lossy(10, 10).length + 4); b.set(lossy(10, 10)); new DataView(b.buffer).setUint32(4, b.length - 8, true); return b; })()],
  ];

  it.each(refused)("refuses %s", (_name, file) => {
    expect(checkWebp(file)).toEqual({ ok: false, reason: "wrong_type" });
  });
});

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
