import { afterEach, describe, expect, it, vi } from "vitest";

// The health endpoint is public: on failure it must answer a fixed code, never the driver's message
// (which can name hosts, ports or the database). The detail goes to the server log only.
const { queryRaw } = vi.hoisted(() => ({ queryRaw: vi.fn() }));
vi.mock("@/shared/lib/prisma", () => ({ getPrisma: () => ({ $queryRaw: queryRaw }) }));

import { checkDatabase } from "@/shared/lib/db-health";

afterEach(() => vi.restoreAllMocks());

describe("checkDatabase", () => {
  it("answers ok with the database name on success, exactly", async () => {
    queryRaw.mockResolvedValue([{ database: "neondb" }]);
    expect(await checkDatabase()).toEqual({ ok: true, database: "neondb" });
  });

  it("answers a fixed code on failure and keeps the driver message out of the body", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    queryRaw.mockRejectedValue(new Error("connect ECONNREFUSED secret-host.example.test:5432 db=private"));
    const result = await checkDatabase();
    expect(result).toEqual({ ok: false, error: "database_unavailable" });
    expect(JSON.stringify(result)).not.toContain("secret-host");
    expect(log).toHaveBeenCalled();
    expect(JSON.stringify(log.mock.calls)).toContain("secret-host");
  });

  it("answers the same fixed code for a non-Error throw", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    queryRaw.mockRejectedValue("weird");
    expect(await checkDatabase()).toEqual({ ok: false, error: "database_unavailable" });
  });
});
