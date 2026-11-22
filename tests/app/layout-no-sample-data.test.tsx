import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

const { getRequestUser, loadBusiness } = vi.hoisted(() => ({
  getRequestUser: vi.fn(async () => ({ id: "u1", tenantId: "T1", name: "Signed In", role: "owner" })),
  loadBusiness: vi.fn(async () => ({ owner: "Sam" })),
}));

vi.mock("../../src/app/session", () => ({ getRequestUser }));
vi.mock("@/features/brand", () => ({ loadBusiness }));
vi.mock("@/features/app-shell", () => ({ AppShell: "AppShell" }));
vi.mock("@/features/mailbox-prompt", () => ({ loadMailboxPrompt: async () => ({ show: false }), MailboxPromptCard: "MailboxPromptCard" }));
vi.mock("@/features/onboarding", () => ({ scheduleVisitSync: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

import AppLayout from "../../src/app/(app)/layout";

describe("signed-in layout sends no sample data to the shell", () => {
  it("starts search empty and gives the inbox badge no count", async () => {
    const el = (await AppLayout({ children: null })) as { props: { searchRows: unknown; initialInboxCount?: number } };
    expect(el.props.searchRows).toEqual([]);
    expect(el.props.initialInboxCount).toBeUndefined();
  });

  it("imports no page feature's sample rows or count", () => {
    const layout = readFileSync(join(process.cwd(), "src/app/(app)/layout.tsx"), "utf8");
    expect(layout).not.toMatch(/searchRows as|liveSearchRows|INBOX_WAITING_COUNT/);
    expect(layout).not.toMatch(/@\/features\/(inbox|invoices|leads|payments|pipeline|quotes)"/);
  });
});
