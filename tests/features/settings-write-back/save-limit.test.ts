import { describe, expect, it, vi } from "vitest";
import { SAVES_PER_HOUR_PER_TENANT, SAVES_PER_HOUR_PER_USER, handleSaveValues, type SaveRouteDeps } from "../../../src/features/settings-write-back/api/save-route";

// Made-up values only. These hold for any cap values, so they survive the open tenant cap decision.
type User = NonNullable<Awaited<ReturnType<SaveRouteDeps["currentUser"]>>>;
const owner = (id: string, tenantId: string): User => ({ id, role: "owner", tenantId });
const CHANGE = { key: "seasonal_offer_text", expected: "Old", value: "New" };

function counting(skip: (key: string) => boolean = () => false) {
  const counts = new Map<string, number>();
  const hit: SaveRouteDeps["hit"] = async (key, limit) => {
    if (skip(key)) return true;
    const next = (counts.get(key) ?? 0) + 1;
    counts.set(key, next);
    return next <= limit;
  };
  return vi.fn(hit);
}

function sender(hit: SaveRouteDeps["hit"]) {
  const save = vi.fn(async () => ({ results: [] }));
  const post = (user: User, body: unknown = { changes: [CHANGE] }) => handleSaveValues(
    new Request("https://app.test/api/settings/values", { method: "POST", headers: { origin: "https://app.test" }, body: JSON.stringify(body) }),
    { appOrigin: "https://app.test", currentUser: async () => user, isEnabled: () => true, hit, save },
  );
  return { save, post };
}

async function statuses(post: (user: User) => Promise<Response>, user: User, times: number) {
  const out: number[] = [];
  for (let i = 0; i < times; i += 1) out.push((await post(user)).status);
  return out;
}

describe("the save limit, counted for real", () => {
  it("lets one user save up to the lower cap, then answers 429 without saving", async () => {
    const cap = Math.min(SAVES_PER_HOUR_PER_USER, SAVES_PER_HOUR_PER_TENANT);
    const { post, save } = sender(counting());
    const answers = await statuses(post, owner("u1", "tenant-a"), cap + 1);
    expect(answers.slice(0, cap).every((status) => status === 200)).toBe(true);
    expect(answers[cap]).toBe(429);
    expect(save).toHaveBeenCalledTimes(cap);
  });

  it("stops one user at the per-user cap when the tenant cap is not in the way", async () => {
    const { post, save } = sender(counting((key) => key.startsWith("settings-save-tenant:")));
    const answers = await statuses(post, owner("u1", "tenant-a"), SAVES_PER_HOUR_PER_USER + 1);
    expect(answers[SAVES_PER_HOUR_PER_USER - 1]).toBe(200);
    expect(answers[SAVES_PER_HOUR_PER_USER]).toBe(429);
    expect(save).toHaveBeenCalledTimes(SAVES_PER_HOUR_PER_USER);
  });

  it("shares the tenant cap between the owners of one tenant", async () => {
    const { post, save } = sender(counting());
    await statuses(post, owner("u1", "tenant-a"), SAVES_PER_HOUR_PER_TENANT);
    expect((await post(owner("u2", "tenant-a"))).status).toBe(429);
    expect(save).toHaveBeenCalledTimes(SAVES_PER_HOUR_PER_TENANT);
  });

  it("does not let tenant A's count affect tenant B", async () => {
    const { post } = sender(counting());
    await statuses(post, owner("u1", "tenant-a"), SAVES_PER_HOUR_PER_TENANT + 1);
    expect((await post(owner("u2", "tenant-b"))).status).toBe(200);
  });

  it("refuses a tenant id in the body", async () => {
    const { post, save } = sender(counting());
    const answer = await post(owner("u1", "tenant-a"), { changes: [CHANGE], tenantId: "tenant-b" });
    expect(answer.status).toBe(400);
    expect(save).not.toHaveBeenCalled();
  });

  it("fails closed when the limiter errors", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const { post, save } = sender(vi.fn(async () => { throw new Error("limiter down"); }));
    expect((await post(owner("u1", "tenant-a"))).status).toBe(429);
    expect(save).not.toHaveBeenCalled();
    error.mockRestore();
  });

  it.each<[string, User]>([
    ["office", { id: "u2", role: "office", tenantId: "tenant-a" }],
    ["admin", { id: "u3", role: "admin", tenantId: null }],
    ["admin during View as client", { id: "u3", role: "admin", tenantId: "tenant-a" }],
  ])("refuses %s before counting", async (_name, user) => {
    const hit = counting();
    const { post, save } = sender(hit);
    expect((await post(user)).status).toBe(403);
    expect(hit).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });
});
