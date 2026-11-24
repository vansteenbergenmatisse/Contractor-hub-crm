import { describe, expect, it } from "vitest";
import { imageKindOf, isImageKey, mediaFolderOf } from "../../../src/features/settings/api/image-keys";

describe("isImageKey: one rule for preview, picker and server", () => {
  it.each([
    "business_logo", "business_favicon_url", "business_main_background_video_or_image", "1_our_work_before", "12_our_work_after",
    "partner1_logo", "partner_2_image", "review3_photo", "team1_photo", "home_hero", "home_banner", "about_picture",
    "header_background", "service_image_url", "logo", "favicon", "project_before_photo",
  ])("%s is an image", (key) => {
    expect(isImageKey(key)).toBe(true);
    expect(imageKindOf(key)).not.toBeNull();
  });

  it.each([
    "business_name", "brand_color", "logo_color", "hero_title", "banner_text", "review1_text", "partner1_link", "1_our_work_token",
    "100_our_work_before", "residentialservice1content", "business_hours",
  ])("%s is not an image", (key) => {
    expect(isImageKey(key)).toBe(false);
    expect(imageKindOf(key)).toBeNull();
  });

  it("keeps the SVG kind for the logo and favicon and the photo kind for every other image", () => {
    expect(imageKindOf("business_logo")).toBe("svg");
    expect(imageKindOf("business_favicon_url")).toBe("svg");
    expect(imageKindOf("partner1_logo")).toBe("photo");
    expect(imageKindOf("review2_photo")).toBe("photo");
  });
});

describe("mediaFolderOf", () => {
  it("names the HighLevel folder of the layout folder the key shows in", () => {
    expect(mediaFolderOf("1_our_work_before")).toBe("07.5_Our-work");
    expect(mediaFolderOf("partner1_logo")).toBe("07.1_Sections_Partners");
  });

  it("is null when that folder has no HighLevel name", () => {
    expect(mediaFolderOf("team1_photo")).toBeNull();
    expect(mediaFolderOf("some_unplaced_image")).toBeNull();
  });
});
