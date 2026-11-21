import { describe, expect, it, vi } from "vitest";
import { HighLevelHttpError, searchUsersWithRetry, type HighLevelUser } from "@/features/highlevel";

const query = { companyId: "co", locationId: "loc", query: "a@x.test" };
const user: HighLevelUser = { id: "u", email: "a@x.test", name: null, deleted: false, roleType: null, role: null, locationIds: [] };

function setup(searchUsers: (token: string) => Promise<HighLevelUser[]>) {
  const getLocationToken = vi.fn(async (_tenant: string, options?: { rejectedToken?: string }) => (options?.rejectedToken ? "fresh" : "first"));
  const search = vi.fn(async (token: string) => searchUsers(token));
  return { getLocationToken, search, run: () => searchUsersWithRetry({ getLocationToken, searchUsers: search }, "tenant-1", query) };
}

describe("searchUsersWithRetry", () => {
  it("asks for the token of the given tenant and returns the users", async () => {
    const s = setup(async () => [user]);
    expect(await s.run()).toEqual([user]);
    expect(s.getLocationToken).toHaveBeenCalledWith("tenant-1");
    expect(s.search).toHaveBeenCalledTimes(1);
  });

  it("on a 401 refreshes once (naming the rejected token) and calls once more", async () => {
    const s = setup(async (token) => {
      if (token === "first") throw new HighLevelHttpError("nope", 401);
      return [user];
    });
    expect(await s.run()).toEqual([user]);
    expect(s.getLocationToken).toHaveBeenNthCalledWith(2, "tenant-1", { rejectedToken: "first" });
    expect(s.search).toHaveBeenCalledTimes(2);
  });

  it("a second 401 propagates and there is no third call", async () => {
    const s = setup(async () => { throw new HighLevelHttpError("nope", 401); });
    await expect(s.run()).rejects.toBeInstanceOf(HighLevelHttpError);
    expect(s.search).toHaveBeenCalledTimes(2);
  });

  it.each([[500], [403], [null]])("an error with status %s is not retried", async (status) => {
    const s = setup(async () => { throw new HighLevelHttpError("boom", status); });
    await expect(s.run()).rejects.toBeInstanceOf(HighLevelHttpError);
    expect(s.search).toHaveBeenCalledTimes(1);
  });

  it("an error that is not an HTTP error is not retried", async () => {
    const s = setup(async () => { throw new TypeError("network"); });
    await expect(s.run()).rejects.toBeInstanceOf(TypeError);
    expect(s.search).toHaveBeenCalledTimes(1);
  });
});
