import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  getRequestUser: vi.fn(),
  loadLeads: vi.fn(),
  loadBusiness: vi.fn(),
  loadCalendar: vi.fn(),
  createCalendarReader: vi.fn(),
  createZoneReader: vi.fn(),
  readZone: vi.fn(),
  hitRateLimit: vi.fn(),
}));

vi.mock("../../../src/app/session", () => ({ getRequestUser: m.getRequestUser }));
vi.mock("@/features/auth", () => ({ hitRateLimit: m.hitRateLimit }));
vi.mock("@/features/brand", () => ({ loadBusiness: m.loadBusiness }));
vi.mock("@/features/highlevel", () => ({
  createTenantContactsReader: () => vi.fn(),
  createTenantCalendarReader: m.createCalendarReader,
  createTenantLocationZoneReader: m.createZoneReader,
}));
vi.mock("@/features/calendar", () => ({ loadCalendar: m.loadCalendar, calendarTimeZone: () => null }));
vi.mock("@/features/leads", () => ({ LeadsPage: () => null, LeadsSkeleton: () => null, loadLeads: m.loadLeads }));
vi.mock("@/features/app-shell", () => ({ businessValues: () => ({ business_owner_name: "Sam" }) }));
vi.mock("@/features/today", () => ({ TodayPage: () => null, LeadsTile: () => null, TodayLeadsCard: () => null, AppointmentsTile: () => null, TodayCalendarCard: () => null, dayPartWord: () => "Hello" }));

import LeadsRoute from "../../../src/app/(app)/leads/page";
import TodayRoute from "../../../src/app/(app)/page";

// All values are fake.
const RESULT = { state: "ready", leads: [], loadedAt: "2026-03-04T12:00:00.000Z", complete: true, dropped: 0 };
type Data = ReactElement<Record<string, never>, (props: Record<string, never>) => Promise<ReactElement<{ result: unknown; timeZone?: string | null }>>>;
const leadsData = () => (LeadsRoute() as ReactElement<{ children: Data }>).props.children;

beforeEach(() => {
  vi.clearAllMocks();
  m.getRequestUser.mockResolvedValue({ id: "u1", tenantId: "T1", name: "Pat", role: "owner" });
  m.loadBusiness.mockResolvedValue({ email: null, owner: "Sam" });
  m.loadLeads.mockResolvedValue(RESULT);
  m.createZoneReader.mockReturnValue(m.readZone);
  m.readZone.mockResolvedValue("America/Chicago");
});

describe("the Leads route", () => {
  it("passes the location's zone and makes no calendar read", async () => {
    const data = leadsData();
    const out = await data.type({});
    expect(out.props).toMatchObject({ result: RESULT, timeZone: "America/Chicago" });
    expect(m.readZone).toHaveBeenCalledWith("T1");
    expect(m.loadCalendar).not.toHaveBeenCalled();
    expect(m.createCalendarReader).not.toHaveBeenCalled();
  });

  it("still renders the leads when the zone is unknown", async () => {
    m.readZone.mockResolvedValue(null);
    const data = leadsData();
    const out = await data.type({});
    expect(out.props).toMatchObject({ result: RESULT, timeZone: null });
  });

  it("still renders the leads when the zone read rejects", async () => {
    m.readZone.mockRejectedValue(new Error("down"));
    const data = leadsData();
    const out = await data.type({});
    expect(out.props).toMatchObject({ result: RESULT, timeZone: null });
  });

  it("View as client reads the zone with the viewer's id", async () => {
    m.getRequestUser.mockResolvedValue({ id: "admin-1", tenantId: "T1", name: "Admin", role: "admin", viewing: true });
    const data = leadsData();
    await data.type({});
    expect(m.createZoneReader).toHaveBeenCalledWith(m.hitRateLimit, { viewerId: "admin-1" });
  });
});

describe("the Today route", () => {
  it("the lead sections wait on the zone read, not on the calendar", async () => {
    m.loadCalendar.mockReturnValue(new Promise(() => {}));
    const page = (await TodayRoute()) as ReactElement<{ leadsTile: Data; leadsCard: Data }>;
    for (const slot of [page.props.leadsTile, page.props.leadsCard]) {
      const out = await slot.type({});
      expect(out.props).toMatchObject({ result: RESULT, timeZone: "America/Chicago" });
    }
    expect(m.loadCalendar).not.toHaveBeenCalled();
  });

  it("still renders the leads when the zone read rejects", async () => {
    m.readZone.mockRejectedValue(new Error("down"));
    const page = (await TodayRoute()) as ReactElement<{ leadsTile: Data }>;
    const out = await page.props.leadsTile.type({});
    expect(out.props).toMatchObject({ result: RESULT, timeZone: null });
  });
});
