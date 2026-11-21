import { describe, expect, it, vi } from "vitest";
import { HighLevelHttpError, listCustomValuesWithRetry } from "@/features/highlevel";

const values = [{ key: "main_color", value: "#123456" }];

describe("listCustomValuesWithRetry", () => {
  it("returns nothing when the tenant has no connection", async () => {
    const getLocationToken = vi.fn();
    const result = await listCustomValuesWithRetry(
      { getLocationToken, readLocationId: async () => null, listCustomValues: vi.fn() },
      "t1",
    );
    expect(result).toEqual([]);
    expect(getLocationToken).not.toHaveBeenCalled();
  });

  it("uses the tenant's location id and token", async () => {
    const listCustomValues = vi.fn().mockResolvedValue(values);
    const result = await listCustomValuesWithRetry(
      { getLocationToken: async () => "tok", readLocationId: async () => "loc_9", listCustomValues },
      "t1",
    );
    expect(result).toEqual(values);
    expect(listCustomValues).toHaveBeenCalledWith("tok", "loc_9");
  });

  it("refreshes once on a 401 and passes the rejected token", async () => {
    const getLocationToken = vi.fn().mockResolvedValueOnce("old").mockResolvedValueOnce("new");
    const listCustomValues = vi
      .fn()
      .mockRejectedValueOnce(new HighLevelHttpError("nope", 401))
      .mockResolvedValueOnce(values);
    await listCustomValuesWithRetry({ getLocationToken, readLocationId: async () => "l", listCustomValues }, "t1");
    expect(getLocationToken).toHaveBeenLastCalledWith("t1", { rejectedToken: "old" });
    expect(listCustomValues).toHaveBeenLastCalledWith("new", "l");
  });

  it("does not retry a second 401 or another error", async () => {
    const twice = vi.fn().mockRejectedValue(new HighLevelHttpError("nope", 401));
    await expect(
      listCustomValuesWithRetry({ getLocationToken: async () => "t", readLocationId: async () => "l", listCustomValues: twice }, "t1"),
    ).rejects.toBeInstanceOf(HighLevelHttpError);
    expect(twice).toHaveBeenCalledTimes(2);
    const other = vi.fn().mockRejectedValue(new HighLevelHttpError("boom", 500));
    await expect(
      listCustomValuesWithRetry({ getLocationToken: async () => "t", readLocationId: async () => "l", listCustomValues: other }, "t1"),
    ).rejects.toMatchObject({ status: 500 });
    expect(other).toHaveBeenCalledTimes(1);
  });
});
