import { describe, expect, it, vi } from "vitest";
import { canSeeMailboxPrompt, createMailboxPromptService, MAILBOX_PROMPT_COPY } from "@/features/mailbox-prompt";

// An in-memory table with the real key: one row per user and tenant.
function memoryStore() {
  const rows = new Set<string>();
  const key = (userId: string, tenantId: string) => JSON.stringify([userId, tenantId]);
  return {
    isDismissed: async (userId: string, tenantId: string) => rows.has(key(userId, tenantId)),
    saveDismissal: async (userId: string, tenantId: string) => void rows.add(key(userId, tenantId)),
    clearDismissal: async (userId: string, tenantId: string) => void rows.delete(key(userId, tenantId)),
  };
}

const owner = { id: "u1", role: "owner" as const, tenantId: "t1" };

describe("who sees the prompt", () => {
  it.each(["owner", "office"] as const)("shows for %s with a tenant", (role) => {
    expect(canSeeMailboxPrompt({ role, tenantId: "t1" })).toBe(true);
  });

  it("never shows for an admin, even one with a tenant value", () => {
    expect(canSeeMailboxPrompt({ role: "admin", tenantId: null })).toBe(false);
    expect(canSeeMailboxPrompt({ role: "admin", tenantId: "t1" })).toBe(false);
  });

  it("does not show without a tenant", () => {
    expect(canSeeMailboxPrompt({ role: "owner", tenantId: null })).toBe(false);
  });

  it("does not read the table for an admin", async () => {
    const store = { ...memoryStore(), isDismissed: vi.fn(async () => false) };
    const view = await createMailboxPromptService(store).load({ id: "a", role: "admin", tenantId: null });
    expect(view.show).toBe(false);
    expect(store.isDismissed).not.toHaveBeenCalled();
  });
});

describe("wording", () => {
  const words = Object.values(MAILBOX_PROMPT_COPY).join(" ");

  it("asks the person to check", () => {
    expect(MAILBOX_PROMPT_COPY.body).toBe("Check that your mailbox is connected in HighLevel.");
  });

  it.each([
    /\bis not connected\b/i, /\bisn't connected\b/i, /\bnot connected\b/i, /\bdisconnected\b/i,
    /(?<!check that )\byour (email|mailbox) is connected\b/i, /\bconnected!/i, /\bmissing\b/i, /\bfailed\b/i, /\bneeds\b/i,
  ])("never claims a status (%s)", (claim) => {
    expect(words).not.toMatch(claim);
  });

  it("names no menu path, link or agency", () => {
    expect(words).not.toMatch(/settings|menu|>|https?:|\/|click|go to|forge forward/i);
  });
});

describe("dismissal", () => {
  it("shows until dismissed, then stays hidden for that user and tenant", async () => {
    const service = createMailboxPromptService(memoryStore());
    expect((await service.load(owner)).show).toBe(true);
    expect(await service.dismiss(owner)).toBe(true);
    expect((await service.load(owner)).show).toBe(false);
  });

  it("is idempotent", async () => {
    const service = createMailboxPromptService(memoryStore());
    await service.dismiss(owner);
    expect(await service.dismiss(owner)).toBe(true);
    expect((await service.load(owner)).show).toBe(false);
  });

  it("does not cross tenants or users", async () => {
    const service = createMailboxPromptService(memoryStore());
    await service.dismiss(owner);
    expect((await service.load({ ...owner, tenantId: "t2" })).show).toBe(true);
    expect((await service.load({ ...owner, id: "u2" })).show).toBe(true);
  });

  it("gives each render a new token, so a refreshed layout can show the card again", async () => {
    const service = createMailboxPromptService(memoryStore());
    const first = await service.load(owner);
    const second = await service.load(owner);
    expect(first.token).not.toBe(second.token);
  });
});

describe("failure behaviour", () => {
  it("keeps the card hidden when the state cannot be read (missing table)", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const store = { ...memoryStore(), isDismissed: async () => { throw new Error('relation "MailboxPromptDismissal" does not exist for a@b.test'); } };
    await expect(createMailboxPromptService(store).load(owner)).resolves.toMatchObject({ show: false });
    expect(JSON.stringify(error.mock.calls)).not.toContain("a@b.test");
    error.mockRestore();
  });

  it("keeps the card hidden when the read hangs", async () => {
    const store = { ...memoryStore(), isDismissed: () => new Promise<boolean>(() => {}) };
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const view = await createMailboxPromptService(store, { readTimeoutMs: 5 }).load(owner);
    expect(view.show).toBe(false);
    error.mockRestore();
  });

  it("reports a failed save without throwing", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const store = { ...memoryStore(), saveDismissal: async () => { throw new Error("down"); } };
    await expect(createMailboxPromptService(store).dismiss(owner)).resolves.toBe(false);
    error.mockRestore();
  });
});

describe("failed send seam", () => {
  it("brings the card back after a dismissal, for that user and tenant only", async () => {
    const service = createMailboxPromptService(memoryStore());
    const other = { ...owner, tenantId: "t2" };
    await service.dismiss(owner);
    await service.dismiss(other);
    expect(await service.reopen(owner)).toBe(true);
    expect((await service.load(owner)).show).toBe(true);
    expect((await service.load(other)).show).toBe(false);
  });

  it("does nothing for an admin", async () => {
    const store = { ...memoryStore(), clearDismissal: vi.fn(async () => {}) };
    expect(await createMailboxPromptService(store).reopen({ id: "a", role: "admin", tenantId: null })).toBe(false);
    expect(store.clearDismissal).not.toHaveBeenCalled();
  });

  it("never throws into the send flow", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const store = { ...memoryStore(), clearDismissal: async () => { throw new Error("down"); } };
    await expect(createMailboxPromptService(store).reopen(owner)).resolves.toBe(false);
    error.mockRestore();
  });
});
