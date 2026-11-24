import { beforeEach, describe, expect, it, vi } from "vitest";
import { handleMediaReplace, type MediaRouteDeps } from "@/features/settings-write-back";
import { imageMessage } from "../../../src/features/settings/api/image-messages";
import { lossy } from "./webp-fixtures";

// Wave E: Change image writes a custom value too, so a locked image key is refused on the server.
const ORIGIN = "https://app.example.test";
const OWNER = { id: "U1", role: "owner" as const, tenantId: "T1" };

function request() {
  const body = new FormData();
  body.append("key", "1_our_work_after");
  body.append("expected", "https://a.test/o.webp");
  body.append("file", new Blob([lossy(100, 100) as BlobPart], { type: "image/webp" }));
  return new Request(`${ORIGIN}/api/settings/media`, { method: "POST", headers: { origin: ORIGIN }, body });
}

function deps(isLocked: MediaRouteDeps["isLocked"]) {
  return {
    appOrigin: ORIGIN,
    currentUser: vi.fn(async () => OWNER),
    isEnabled: vi.fn(() => true),
    hit: vi.fn(async () => true),
    replace: vi.fn<MediaRouteDeps["replace"]>(async () => ({ status: "saved" })),
    isLocked,
  } satisfies MediaRouteDeps;
}

beforeEach(() => { vi.spyOn(console, "error").mockImplementation(() => {}); });

describe("Change image and locks", () => {
  it("answers locked and uploads nothing for a locked key", async () => {
    const d = deps(vi.fn(async () => true));
    const response = await handleMediaReplace(request(), d);
    expect(await response.json()).toEqual({ status: "locked" });
    expect(d.isLocked).toHaveBeenCalledWith("T1", "1_our_work_after");
    expect(d.replace).not.toHaveBeenCalled();
  });

  it("answers retry and uploads nothing when the locks cannot be read", async () => {
    const d = deps(vi.fn(async () => { throw new Error("db"); }));
    expect(await (await handleMediaReplace(request(), d)).json()).toEqual({ status: "retry" });
    expect(d.replace).not.toHaveBeenCalled();
  });

  it("replaces an unlocked image", async () => {
    const d = deps(vi.fn(async () => false));
    expect(await (await handleMediaReplace(request(), d)).json()).toEqual({ status: "saved" });
  });

  it("tells the owner who to ask", () => {
    expect(imageMessage("locked")).toContain("Locked by Forge Forward");
  });
});
