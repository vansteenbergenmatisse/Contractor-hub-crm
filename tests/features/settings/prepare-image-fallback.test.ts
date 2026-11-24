// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prepareImageFile } from "../../../src/features/settings/api/prepare-image";

// A canvas that writes only the formats in `can`; any other request quietly gives a PNG, as browsers do.
function canvasThatWrites(can: readonly string[]) {
  const asked: string[] = [];
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => ({ drawImage: vi.fn() }),
    toBlob: (done: (b: Blob | null) => void, type: string) => {
      asked.push(type);
      done(new Blob([new Uint8Array(300 * 1024)], { type: can.includes(type) ? type : "image/png" }));
    },
  };
  vi.spyOn(document, "createElement").mockReturnValue(canvas as unknown as HTMLElement);
  return asked;
}
const bigPhoto = () => new File([new Uint8Array(5 * 1024 * 1024)], "a.png", { type: "image/png" });

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => "blob:x");
  vi.stubGlobal("createImageBitmap", vi.fn(async () => ({ width: 3000, height: 2000, close: vi.fn() })));
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("prepareImageFile: compression every time", () => {
  it("falls back to JPEG when the browser cannot write WebP (older iOS Safari)", async () => {
    const asked = canvasThatWrites(["image/jpeg"]);
    const result = await prepareImageFile(bigPhoto(), "photo");
    expect(result.ok && result.blob.type).toBe("image/jpeg");
    expect(asked).toEqual(["image/webp", "image/jpeg"]);
  });

  it("shows the size before and after", async () => {
    canvasThatWrites(["image/webp"]);
    const result = await prepareImageFile(bigPhoto(), "photo");
    expect(result.ok && result.summary).toBe("WebP, 2400 by 1600, 300 KB (was 5.0 MB)");
  });

  it("asks for an explicit format only, never a fallback", async () => {
    const asked = canvasThatWrites(["image/jpeg"]);
    expect((await prepareImageFile(bigPhoto(), "photo", "webp")).ok).toBe(false);
    expect(asked).toEqual(["image/webp"]);
  });
});
