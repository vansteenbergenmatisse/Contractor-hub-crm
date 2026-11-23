import { describe, expect, it } from "vitest";
import { checkJpeg, checkPng } from "../../../src/features/settings-write-back/api/raster-check";

const u32 = (value: number) => [(value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255];
const chunk = (type: string, data: number[] = []) => [...u32(data.length), ...[...type].map((c) => c.charCodeAt(0)), ...data, 0, 0, 0, 0];
const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const ihdr = (width: number, height: number) => chunk("IHDR", [...u32(width), ...u32(height), 8, 6, 0, 0, 0]);
const png = (parts: number[][]) => new Uint8Array([...SIGNATURE, ...parts.flat()]);
const goodPng = (width = 10, height = 20) => png([ihdr(width, height), chunk("sRGB", [0]), chunk("IDAT", [1, 2, 3]), chunk("IEND")]);

const segment = (marker: number, data: number[]) => [0xff, marker, ((data.length + 2) >> 8) & 255, (data.length + 2) & 255, ...data];
const sof = (width: number, height: number, marker = 0xc0) => segment(marker, [8, height >> 8, height & 255, width >> 8, width & 255, 1, 1, 0x11, 0]);
const jpeg = (parts: number[][]) => new Uint8Array([0xff, 0xd8, ...parts.flat()]);
const goodParts = (width = 10, height = 20) => [segment(0xe0, [0x4a, 0x46, 0x49, 0x46, 0]), segment(0xdb, [0, 1, 2]), sof(width, height), segment(0xc4, [0, 1]), segment(0xda, [1, 1, 0, 0, 63, 0]), [0x12, 0xff, 0x00, 0x34, 0xff, 0xd0, 0x56], [0xff, 0xd9]];

describe("checkPng", () => {
  it("accepts a plain PNG and reads its size", () => {
    expect(checkPng(goodPng())).toEqual({ ok: true, width: 10, height: 20 });
  });

  it.each([
    ["data after the end", new Uint8Array([...goodPng(), 1])],
    ["a text chunk", png([ihdr(1, 1), chunk("tEXt", [65]), chunk("IDAT", [1]), chunk("IEND")])],
    ["an EXIF chunk", png([ihdr(1, 1), chunk("eXIf", [65]), chunk("IDAT", [1]), chunk("IEND")])],
    ["an animated PNG", png([ihdr(1, 1), chunk("acTL", [0, 0, 0, 1, 0, 0, 0, 0]), chunk("IDAT", [1]), chunk("IEND")])],
    ["no image data", png([ihdr(1, 1), chunk("IEND")])],
    ["no end chunk", png([ihdr(1, 1), chunk("IDAT", [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])])],
    ["IHDR not first", png([chunk("IDAT", [1]), ihdr(1, 1), chunk("IEND")])],
    ["a chunk longer than the file", png([ihdr(1, 1), [0, 255, 255, 255, 73, 68, 65, 84, 0, 0, 0, 0], chunk("IEND")])],
    ["a large color profile", png([ihdr(1, 1), chunk("iCCP", new Array(4097).fill(1)), chunk("IDAT", [1]), chunk("IEND")])],
    ["not a PNG", new Uint8Array(60)],
  ])("refuses %s", (_name, file) => {
    expect(checkPng(file)).toEqual({ ok: false, reason: "wrong_type" });
  });

  it.each([[2401, 10], [10, 2401], [0, 10]])("refuses the size %s by %s", (width, height) => {
    expect(checkPng(goodPng(width, height))).toEqual({ ok: false, reason: "dimensions" });
  });

  it("refuses a file over 2 MB", () => {
    expect(checkPng(new Uint8Array(2 * 1024 * 1024 + 1))).toEqual({ ok: false, reason: "too_large" });
  });
});

describe("checkJpeg", () => {
  it("accepts a plain JPEG and reads its size", () => {
    expect(checkJpeg(jpeg(goodParts()))).toEqual({ ok: true, width: 10, height: 20 });
  });

  it("accepts a progressive JPEG with more than one scan", () => {
    const parts = goodParts();
    const scan = [segment(0xda, [1, 1, 0, 0, 63, 0]), [0x77]];
    expect(checkJpeg(jpeg([...parts.slice(0, -1), ...scan, parts[parts.length - 1]])).ok).toBe(true);
  });

  it.each([
    ["data after the end", jpeg([...goodParts(), [1]])],
    ["an EXIF segment", jpeg([segment(0xe1, [69, 120]), ...goodParts()])],
    ["a comment segment", jpeg([segment(0xfe, [65]), ...goodParts()])],
    ["no frame", jpeg([segment(0xda, [1, 1, 0, 0, 63, 0]), [1], [0xff, 0xd9]])],
    ["two frames", jpeg([sof(1, 1), ...goodParts()])],
    ["no scan", jpeg([sof(1, 1), [0xff, 0xd9]])],
    ["no end", jpeg(goodParts().slice(0, -1))],
    ["a segment longer than the file", jpeg([[0xff, 0xdb, 0xff, 0xff, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]])],
    ["not a JPEG", new Uint8Array(60)],
  ])("refuses %s", (_name, file) => {
    expect(checkJpeg(file)).toEqual({ ok: false, reason: "wrong_type" });
  });

  it("refuses a side over the limit", () => {
    const parts = goodParts(2401, 10);
    expect(checkJpeg(jpeg(parts))).toEqual({ ok: false, reason: "dimensions" });
  });
});
