import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The admin-issued sign-in links share the client's daily mail cap: "Send sign-in email" AND "Invite
// owner" on an email with a never-used account (that path skipped the cap before). The real routes
// and the real reserve run against a faked Prisma table.
const state = vi.hoisted(() => ({
  mailCount: 0,
  failReads: false,
  inviteOptions: [] as Array<{ mailBudget?: (tenantId: string, send: () => Promise<void>) => Promise<void> }>,
  signInOptions: [] as Array<{ mailBudget?: (tenantId: string, send: () => Promise<void>) => Promise<void> }>,
}));

const fakePrisma = vi.hoisted(() => ({
  tenantSyncState: {
    createMany: async () => {
      if (state.failReads) throw new Error("db down");
      return { count: 0 };
    },
    updateMany: async (args: { data: Record<string, unknown>; where: { mailCount?: { lt: number } } }) => {
      if (state.failReads) throw new Error("db down");
      if (args.where.mailCount) {
        if (state.mailCount >= args.where.mailCount.lt) return { count: 0 };
        state.mailCount += 1;
        return { count: 1 };
      }
      return { count: 0 };
    },
  },
}));
vi.mock("@/shared/lib/prisma", () => ({ getPrisma: () => fakePrisma }));

vi.mock("@/features/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/auth")>()),
  getGuards: () => ({}),
  getInviteLimiter: () => ({}),
  getInviteService: (options: (typeof state.inviteOptions)[number] = {}) => {
    state.inviteOptions.push(options);
    return {};
  },
  getSignInLinkService: (options: (typeof state.signInOptions)[number] = {}) => {
    state.signInOptions.push(options);
    return {};
  },
  handleCreateInvite: async () => new Response(null, { status: 204 }),
  handleSendSignInEmail: async () => new Response(null, { status: 204 }),
}));

vi.mock("@/shared/config", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/shared/config")>()),
  parseEnv: () => ({ APP_URL: "https://crm.example.test" }),
}));

import { createSignInMailBudget, MailBudgetUnreadableError, MAX_SET_PASSWORD_MAILS_PER_TENANT_PER_DAY } from "@/features/onboarding";
import { POST as inviteOwner } from "../../../src/app/api/admin/invites/route";
import { POST as sendSignInEmail } from "../../../src/app/api/invites/sign-in-email/route";

const request = () => new Request("https://crm.example.test/x", { method: "POST" });

beforeEach(() => {
  state.mailCount = 0;
  state.failReads = false;
  state.inviteOptions = [];
  state.signInOptions = [];
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("createSignInMailBudget", () => {
  it("sends while the client is under the daily cap, then stops", async () => {
    const budget = createSignInMailBudget({ now: () => new Date(), reserve: async (_t, _d, cap) => (state.mailCount++ < cap) });
    const send = vi.fn(async () => {});
    for (let i = 0; i < MAX_SET_PASSWORD_MAILS_PER_TENANT_PER_DAY + 2; i += 1) await budget("t1", send);
    expect(send).toHaveBeenCalledTimes(MAX_SET_PASSWORD_MAILS_PER_TENANT_PER_DAY);
  });

  it("counts even while ONBOARDING_SEND_SET_PASSWORD is off", async () => {
    vi.stubEnv("ONBOARDING_SEND_SET_PASSWORD", "");
    const reserve = vi.fn(async () => true);
    await createSignInMailBudget({ now: () => new Date(), reserve })("t1", async () => {});
    expect(reserve).toHaveBeenCalledTimes(1);
    vi.unstubAllEnvs();
  });

  it("rejects (and does not send) when the budget cannot be read", async () => {
    const send = vi.fn(async () => {});
    const budget = createSignInMailBudget({ now: () => new Date(), reserve: async () => { throw new Error("db"); } });
    await expect(budget("t1", send)).rejects.toBeInstanceOf(MailBudgetUnreadableError);
    expect(send).not.toHaveBeenCalled();
  });
});

describe("the routes pass the per-client budget to the link service", () => {
  it.each([
    ["Invite owner (POST /api/admin/invites)", inviteOwner, () => state.inviteOptions],
    ["Send sign-in email (POST /api/invites/sign-in-email)", sendSignInEmail, () => state.signInOptions],
  ])("%s: real reserve, capped at the daily limit, rejects when unreadable", async (_name, route, options) => {
    await route(request());
    const budget = options()[0]?.mailBudget;
    expect(budget).toBeTypeOf("function");
    const send = vi.fn(async () => {});
    state.mailCount = MAX_SET_PASSWORD_MAILS_PER_TENANT_PER_DAY - 1;
    await budget!("t1", send);
    await budget!("t1", send);
    expect(send).toHaveBeenCalledTimes(1);
    state.failReads = true;
    await expect(budget!("t1", send)).rejects.toBeInstanceOf(MailBudgetUnreadableError);
    expect(send).toHaveBeenCalledTimes(1);
  });
});
