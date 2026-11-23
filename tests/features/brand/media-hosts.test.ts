import { describe, expect, it } from "vitest";
import { allowedLogoHosts, isAllowedLogoUrl } from "@/features/brand";
import { isBackgroundImagePath } from "../../../src/features/brand/api/sign-in-brand";
import { DEFAULT_IMAGE_HOSTS, previewSrc } from "../../../src/features/settings/api/image-preview";

const MEDIA = "files.leadconnectorhq.com";
const OLD = "assets.cdn.filesafe.space";

describe("media hosts", () => {
  it("allows both HighLevel media hosts, in the logo fetch and in the preview", () => {
    expect(allowedLogoHosts("")).toEqual([OLD, MEDIA]);
    expect(DEFAULT_IMAGE_HOSTS).toEqual([OLD, MEDIA]);
    expect(isAllowedLogoUrl(`https://${MEDIA}/abc`, allowedLogoHosts(""))).toBe(true);
    expect(isAllowedLogoUrl(`https://${MEDIA}.evil.test/abc`, allowedLogoHosts(""))).toBe(false);
  });
});

describe("the background image-only rule", () => {
  it("accepts a media link without a file extension on the new host", () => {
    expect(isBackgroundImagePath(new URL(`https://${MEDIA}/a/b/c`))).toBe(true);
    expect(previewSrc(`https://${MEDIA}/a/b/c`, [MEDIA], true)).toBe(`https://${MEDIA}/a/b/c`);
  });

  it.each(["clip.mp4", "clip.webm", "clip.mov", "page.html", "logo.svg", "a.jpg.mp4"])("still refuses %s on the new host", (file) => {
    expect(isBackgroundImagePath(new URL(`https://${MEDIA}/a/${file}`))).toBe(false);
    expect(previewSrc(`https://${MEDIA}/a/${file}`, [MEDIA], true)).toBeNull();
  });

  it("still accepts an image extension on the new host", () => {
    expect(isBackgroundImagePath(new URL(`https://${MEDIA}/a/hero.webp`))).toBe(true);
  });

  it("does not loosen the rule for other hosts: no extension is still refused", () => {
    expect(isBackgroundImagePath(new URL(`https://${OLD}/a/hero`))).toBe(false);
    expect(previewSrc(`https://${OLD}/a/hero`, [OLD], true)).toBeNull();
  });

  it("refuses an empty path on the new host", () => {
    expect(isBackgroundImagePath(new URL(`https://${MEDIA}/`))).toBe(false);
  });
});
