import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getRequestUser, loadLeads, readTenantContacts, loadBusiness, hitRateLimit } = vi.hoisted(() => ({
  getRequestUser: vi.fn(),
  loadLeads: vi.fn(),
  readTenantContacts: vi.fn(),
  loadBusiness: vi.fn(),
  hitRateLimit: vi.fn(),
}));

vi.mock("../../../src/app/session", () => ({ getRequestUser }));
vi.mock("@/features/auth", () => ({ hitRateLimit }));
// The route gets the throttled reader only when it passes the real limiter.
vi.mock("@/features/highlevel", () => ({
  createTenantContactsReader: (hit: unknown) => (hit === hitRateLimit ? readTenantContacts : null),
}));
vi.mock("@/features/leads", () => ({ loadLeads }));
vi.mock("@/features/brand", () => ({ loadBusiness }));
vi.mock("@/features/app-shell", () => ({ businessValues: (b: { owner: string }) => ({ business_owner_name: b.owner }) }));
vi.mock("@/features/today", () => ({ TodayPage: () => null, LeadsTile: () => null, TodayLeadsCard: () => null }));

import TodayRoute from "../../../src/app/(app)/page";

type Slot = ReactElement<Record<string, never>, (props: Record<string, never>) => Promise<ReactElement<{ result: unknown }>>>;
const RESULT = { state: "empty" };

beforeEach(() => {
  vi.clearAllMocks();
  loadLeads.mockResolvedValue(RESULT);
  loadBusiness.mockResolvedValue({ owner: "Sam Example" });
});

describe("the Today route", () => {
  it("loads the leads of the session's tenant, with the injected reader, for both slots", async () => {
    getRequestUser.mockResolvedValue({ tenantId: "T1", name: "Signed In", role: "owner" });
    const page = (await TodayRoute()) as ReactElement<{ leadsTile: Slot; leadsCard: Slot }>;
    expect(loadLeads).not.toHaveBeenCalled();
    for (const slot of [page.props.leadsTile, page.props.leadsCard]) {
      const out = await slot.type({});
      expect(out.props.result).toBe(RESULT);
    }
    expect(loadLeads).toHaveBeenCalledWith("T1", readTenantContacts);
  });

  it("passes no tenant when the session has none", async () => {
    getRequestUser.mockResolvedValue(null);
    const page = (await TodayRoute()) as ReactElement<{ leadsTile: Slot }>;
    await page.props.leadsTile.type({});
    expect(loadLeads).toHaveBeenCalledWith(undefined, readTenantContacts);
  });
});
