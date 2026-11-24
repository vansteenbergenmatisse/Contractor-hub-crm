import { describe, expect, it } from "vitest";
import { imageKindOf, isImageKey } from "../../../src/features/settings/api/image-keys";
import { imageFailureMessage, imageSavedMessage } from "../../../src/features/settings/api/image-messages";
import type { ImageStatus } from "../../../src/features/settings/types";

describe("isImageKey: links, colors and texts are not images", () => {
  it.each(["hero_link", "banner_link", "header_logo_link", "section_bg", "hero_bg", "bg"])("%s is not an image", (key) => {
    expect(isImageKey(key)).toBe(false);
    expect(imageKindOf(key)).toBeNull();
  });
});

describe("imageFailureMessage on an empty value: there is no current image to speak of", () => {
  const stops: Exclude<ImageStatus, "saved">[] = [
    "needs_approval", "connection", "busy", "rejected", "retry", "limited", "invalid", "failed", "library_limit", "ambiguous",
  ];

  it.each(stops)("%s does not say a current image is still live", (status) => {
    const text = imageFailureMessage({ status }, { empty: true });
    expect(text).not.toMatch(/current image/i);
    expect(text).toMatch(/no image was added|nothing was (added|changed)/i);
  });

  it("keeps the current-image wording when there is one", () => {
    expect(imageFailureMessage({ status: "retry" })).toMatch(/still live/);
    expect(imageFailureMessage({ status: "retry" }, { empty: false })).toMatch(/still live/);
  });

  it("names a duplicate folder on an empty value, and allows for one otherwise", () => {
    const empty = imageFailureMessage({ status: "ambiguous" }, { empty: true });
    expect(empty).toMatch(/more than one folder/i);
    expect(empty).not.toMatch(/this image is in your media library/i);
    expect(imageFailureMessage({ status: "ambiguous" })).toMatch(/folder/i);
  });

  it("says an invalid SVG on an empty value added nothing", () => {
    const text = imageFailureMessage({ status: "invalid", svgProblem: "script" }, { empty: true });
    expect(text).toMatch(/script/i);
    expect(text).not.toMatch(/current image/i);
  });
});

describe("imageSavedMessage: an outside link was replaced", () => {
  it("says the old link was not a library file, so nothing was removed", () => {
    expect(imageSavedMessage({ status: "saved", url: "https://x.test/a", oldFile: "outside" })).toMatch(/not in your media library/i);
  });
});
