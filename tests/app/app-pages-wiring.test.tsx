import { beforeEach, describe, expect, it, vi } from "vitest";

// The signed-in layout and the Today page share one request-cached user lookup (getRequestUser) and
// one business lookup from the brand feature. Nothing calls currentUserFromHeaders a second time.
const { getRequestUser, currentUserFromHeaders, loadBusiness, TodayPage, redirect } = vi.hoisted(() => ({
  getRequestUser: vi.fn(),
  currentUserFromHeaders: vi.fn(),
  loadBusiness: vi.fn(),
  TodayPage: vi.fn(() => null),
  redirect: vi.fn((to: string) => {
    throw new Error(`NEXT_REDIRECT ${to}`);
  }),
}));

vi.mock("../../src/app/session", () => ({ getRequestUser }));
vi.mock("@/features/auth", () => ({ currentUserFromHeaders }));
vi.mock("@/features/brand", () => ({ loadBusiness }));
vi.mock("@/features/today", () => ({ TodayPage }));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/features/app-shell", () => ({
  AppShell: "AppShell",
  businessValues: (b: { owner: string }) => ({ business_owner_name: b.owner }),
}));
vi.mock("@/features/inbox", () => ({ searchRows: [], INBOX_WAITING_COUNT: 0 }));
vi.mock("@/features/invoices", () => ({ searchRows: [] }));
vi.mock("@/features/leads", () => ({ searchRows: [] }));
vi.mock("@/features/payments", () => ({ searchRows: [] }));
vi.mock("@/features/pipeline", () => ({ searchRows: [] }));
vi.mock("@/features/quotes", () => ({ searchRows: [] }));

import TodayRoute from "../../src/app/(app)/page";
import AppLayout from "../../src/app/(app)/layout";

beforeEach(() => vi.clearAllMocks());

describe("Today page", () => {
  it("greets the owner by first name, using the request-cached user and the brand business", async () => {
    getRequestUser.mockResolvedValue({ tenantId: "T1", name: "Signed In", role: "owner" });
    loadBusiness.mockResolvedValue({ owner: "Sam Example" });
    const el = (await TodayRoute()) as { props: { ownerFirst?: string } };
    expect(el.props.ownerFirst).toBe("Sam");
    expect(loadBusiness).toHaveBeenCalledWith("T1", "Signed In");
    expect(getRequestUser).toHaveBeenCalled();
    expect(currentUserFromHeaders).not.toHaveBeenCalled();
  });

  it("gives a plain greeting with no tenant", async () => {
    getRequestUser.mockResolvedValue(null);
    const el = (await TodayRoute()) as { props: { ownerFirst?: string } };
    expect(el.props.ownerFirst).toBeUndefined();
    expect(loadBusiness).not.toHaveBeenCalled();
  });
});

describe("signed-in layout", () => {
  it("loads the business from the brand feature for the session's tenant", async () => {
    getRequestUser.mockResolvedValue({ tenantId: "T1", name: "Signed In", role: "owner" });
    loadBusiness.mockResolvedValue({ owner: "Sam" });
    const el = (await AppLayout({ children: null })) as { props: { business: unknown } };
    expect(loadBusiness).toHaveBeenCalledWith("T1", "Signed In");
    expect(el.props.business).toEqual({ owner: "Sam" });
  });

  it("sends signed-out users to sign-in", async () => {
    getRequestUser.mockResolvedValue(null);
    await expect(AppLayout({ children: null })).rejects.toThrow("NEXT_REDIRECT /sign-in");
  });
});
