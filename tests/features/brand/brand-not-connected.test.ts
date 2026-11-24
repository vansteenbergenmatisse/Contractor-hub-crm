import { describe, expect, it, vi } from "vitest";
import { createBrandService, EMPTY_BRAND } from "@/features/brand";
import { CustomValuesNotConnectedError } from "@/features/highlevel";

// Review of fix/settings-blank-values: a tenant with no connection rejects from `fetchValues`. The
// brand falls back to the neutral brand, the Settings read sees the not-connected error, and nothing is
// cached, so a tenant that connects a moment later gets its values on the next request.
const values = [{ key: "main_color", value: "#123456" }];

describe("brand service with a not-connected tenant", () => {
  it("returns the neutral brand, passes the error to getValues and caches nothing", async () => {
    const fetchValues = vi.fn().mockRejectedValueOnce(new CustomValuesNotConnectedError()).mockRejectedValueOnce(new CustomValuesNotConnectedError()).mockResolvedValue(values);
    const service = createBrandService({ fetchValues, now: () => 1_000_000, ttlMs: 60_000 });
    expect(await service.getBrand("t1")).toEqual(EMPTY_BRAND);
    await expect(service.getValues("t1")).rejects.toBeInstanceOf(CustomValuesNotConnectedError);
    expect((await service.getBrand("t1")).cssVars["--main-color"]).toBe("#123456");
    expect(fetchValues).toHaveBeenCalledTimes(3);
  });
});
