import { beforeEach, describe, expect, it, vi } from "vitest";

const { currentUser, createMany } = vi.hoisted(() => ({ currentUser: vi.fn(), createMany: vi.fn() }));

vi.mock("@/features/auth", () => ({ getGuards: () => ({ currentUser }) }));
vi.mock("@/shared/config", () => ({ parseEnv: () => ({ APP_URL: "https://app.example.test/" }) }));
vi.mock("@/shared/lib/prisma", () => ({ getPrisma: () => ({ mailboxPromptDismissal: { createMany } }) }));

import { POST } from "../../../src/app/api/mailbox-prompt/dismiss/route";

const ORIGIN = "https://app.example.test";
const post = (origin: string | null, body?: string) =>
  POST(new Request(`${ORIGIN}/api/mailbox-prompt/dismiss`, {
    method: "POST",
    headers: origin ? { origin } : {},
    body,
  }));

beforeEach(() => {
  currentUser.mockReset();
  createMany.mockReset();
  createMany.mockResolvedValue({ count: 1 });
  currentUser.mockResolvedValue({ id: "u1", role: "office", tenantId: "t1", email: "person@example.test" });
});

describe("POST /api/mailbox-prompt/dismiss", () => {
  it("saves for the session's user and tenant", async () => {
    const response = await post(ORIGIN);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(createMany).toHaveBeenCalledWith({ data: [{ userId: "u1", tenantId: "t1" }], skipDuplicates: true });
  });

  it("ignores ids in the body", async () => {
    await post(ORIGIN, JSON.stringify({ userId: "victim", tenantId: "t9" }));
    expect(createMany).toHaveBeenCalledWith({ data: [{ userId: "u1", tenantId: "t1" }], skipDuplicates: true });
  });

  it("answers the same on a repeat", async () => {
    createMany.mockResolvedValue({ count: 0 });
    expect((await post(ORIGIN)).status).toBe(200);
  });

  it("rejects a signed-out request", async () => {
    currentUser.mockResolvedValue(null);
    const response = await post(ORIGIN);
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "unauthorized" });
    expect(createMany).not.toHaveBeenCalled();
  });

  it("rejects an admin", async () => {
    currentUser.mockResolvedValue({ id: "a", role: "admin", tenantId: null });
    expect((await post(ORIGIN)).status).toBe(403);
    expect(createMany).not.toHaveBeenCalled();
  });

  it.each(["https://evil.example", "null", "http://app.example.test"])("rejects origin %s", async (origin) => {
    const response = await post(origin);
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "forbidden" });
    expect(createMany).not.toHaveBeenCalled();
  });

  it("rejects a request without an Origin header", async () => {
    expect((await post(null)).status).toBe(403);
    expect(createMany).not.toHaveBeenCalled();
  });

  it("answers a fixed error and logs no personal data when the save fails", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    createMany.mockRejectedValue(new Error("failed for person@example.test"));
    const response = await post(ORIGIN);
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "failed" });
    expect(JSON.stringify(error.mock.calls)).not.toContain("person@example.test");
    error.mockRestore();
  });

  it("is never cached", async () => {
    expect((await post(ORIGIN)).headers.get("cache-control")).toBe("no-store");
  });
});
