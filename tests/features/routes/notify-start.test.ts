import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import {
  handleNotifyStart,
  isNotifiableCalendar,
  isRoutesNotifyEnabled,
  loadNotifyView,
  type NotifyStartDeps,
  type RouteEventRow,
  type RoutesReader,
} from "@/features/routes";

// Mocked HighLevel and database only. All values are fake.
const NOW = Date.parse("2026-11-23T15:00:00Z");
const DAY = { startMs: Date.parse("2026-11-23T00:00:00Z"), endMs: Date.parse("2026-11-24T00:00:00Z") };
const row = (over: Partial<RouteEventRow> = {}): RouteEventRow => ({
  id: "appt-1", calendarId: "cal-1", calendarName: "Jobs", title: "Pat Test", address: "1 Test St", status: "confirmed",
  startMs: NOW + 3_600_000, endMs: NOW + 7_200_000, ...over,
});
const readerOf = (events: RouteEventRow[], over: Record<string, unknown> = {}) =>
  vi.fn(async (_tenantId: string, boundsFor: (zone: string) => unknown) => {
    boundsFor("UTC");
    return { ok: true, timeZone: "UTC", range: DAY, calendarCount: 1, events, dropped: 0, complete: true, ...over };
  }) as unknown as RoutesReader;

type MockDeps = NotifyStartDeps & {
  currentUser: Mock<NotifyStartDeps["currentUser"]>;
  claim: Mock<NotifyStartDeps["claim"]>;
  pulseTag: Mock<NotifyStartDeps["pulseTag"]>;
};
type Claim = { tenantId: string; appointmentId: string; actorId: string; outcome: string };
function setup(over: Partial<NotifyStartDeps> = {}, events: RouteEventRow[] = [row()]) {
  const claims = new Map<string, Claim>();
  const key = (tenantId: string, appointmentId: string) => `${tenantId}|${appointmentId}`;
  const deps = {
    appOrigin: "https://app.test",
    currentUser: vi.fn(async () => ({ id: "u1", role: "owner" as const, tenantId: "T1" })),
    isEnabled: vi.fn(() => true),
    hit: vi.fn(async () => true),
    read: readerOf(events),
    now: () => new Date(NOW),
    readAppointmentContact: vi.fn(async () => ({ ok: true as const, contactId: "contact-1" })),
    readContactTagState: vi.fn(async () => ({ ok: true as const, hasTag: false })),
    pulseTag: vi.fn(async () => "sent" as const),
    readOutcome: vi.fn(async (tenantId: string, appointmentId: string) => claims.get(key(tenantId, appointmentId))?.outcome ?? null),
    claim: vi.fn(async (input: { tenantId: string; appointmentId: string; actorId: string }) => {
      if (claims.has(key(input.tenantId, input.appointmentId))) return false;
      claims.set(key(input.tenantId, input.appointmentId), { ...input, outcome: "pending" });
      return true;
    }),
    finish: vi.fn(async (tenantId: string, appointmentId: string, outcome: string) => {
      claims.get(key(tenantId, appointmentId))!.outcome = outcome;
    }),
    ...over,
  };
  return { deps: deps as unknown as MockDeps, claims };
}
const post = (body: unknown = { appointmentId: "appt-1" }, origin: string | null = "https://app.test") =>
  new Request("https://app.test/api/routes/notify", {
    method: "POST",
    headers: origin ? { origin, "content-type": "application/json" } : { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
const send = async (deps: NotifyStartDeps, request = post()) => {
  const response = await handleNotifyStart(request, deps);
  return { status: response.status, body: await response.json() as { status?: string; reason?: string; error?: string } };
};

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("the flag", () => {
  it("is off unless ENABLED is exactly true and the exact tenant id is listed", () => {
    expect(isRoutesNotifyEnabled("T1", {})).toBe(false);
    expect(isRoutesNotifyEnabled("T1", { ROUTES_NOTIFY_ENABLED: "true" })).toBe(false);
    expect(isRoutesNotifyEnabled("T1", { ROUTES_NOTIFY_ENABLED: "1", ROUTES_NOTIFY_TENANTS: "T1" })).toBe(false);
    expect(isRoutesNotifyEnabled("T1", { ROUTES_NOTIFY_ENABLED: "true", ROUTES_NOTIFY_TENANTS: "*" })).toBe(false);
    expect(isRoutesNotifyEnabled("T1", { ROUTES_NOTIFY_ENABLED: "true", ROUTES_NOTIFY_TENANTS: "T10,T2" })).toBe(false);
    expect(isRoutesNotifyEnabled("T1", { ROUTES_NOTIFY_ENABLED: "true", ROUTES_NOTIFY_TENANTS: "T2, T1" })).toBe(true);
  });

  it("answers 404 and calls nothing when off", async () => {
    const { deps } = setup({ isEnabled: vi.fn(() => false) });
    expect((await send(deps)).status).toBe(404);
    expect(deps.hit).not.toHaveBeenCalled();
    expect(deps.pulseTag).not.toHaveBeenCalled();
  });
});

describe("the calendar rule", () => {
  it.each(["Job", "Jobs", "Estimate", "Estimates", " jobs ", "ESTIMATES"])("accepts %s", (name) => {
    expect(isNotifiableCalendar(name)).toBe(true);
  });
  it.each(["Job Interview", "Estimate review call", "Team meeting", "Not a job", "Jobs 2", "", null])("refuses %s", (name) => {
    expect(isNotifiableCalendar(name)).toBe(false);
  });
});

describe("who may call it", () => {
  it("refuses another origin and a missing origin before reading the session", async () => {
    for (const origin of ["https://evil.test", null]) {
      const { deps } = setup();
      expect((await send(deps, post(undefined, origin))).status).toBe(403);
      expect(deps.currentUser).not.toHaveBeenCalled();
    }
  });

  it("refuses no session", async () => {
    const { deps } = setup({ currentUser: vi.fn(async () => null) });
    expect((await send(deps)).status).toBe(401);
  });

  it("refuses an admin, also during View as client", async () => {
    for (const user of [
      { id: "a", role: "admin" as const, tenantId: null },
      { id: "a", role: "admin" as const, tenantId: "T1", viewing: true },
      { id: "o", role: "owner" as const, tenantId: "T1", viewing: true },
    ]) {
      const { deps } = setup({ currentUser: vi.fn(async () => user) });
      expect((await send(deps)).status).toBe(403);
      expect(deps.pulseTag).not.toHaveBeenCalled();
    }
  });

  it("allows an office user", async () => {
    const { deps } = setup({ currentUser: vi.fn(async () => ({ id: "u2", role: "office" as const, tenantId: "T1" })) });
    expect((await send(deps)).body.status).toBe("notified");
  });

  it.each([[false], ["throw"]])("answers 429 when the limiter says %s", async (mode) => {
    const hit = vi.fn(async () => {
      if (mode === "throw") throw new Error("down");
      return false;
    });
    const { deps } = setup({ hit });
    expect((await send(deps)).status).toBe(429);
    expect(deps.read).not.toHaveBeenCalled();
  });

  it.each([
    "not json", {}, { appointmentId: "" }, { appointmentId: 5 }, { appointmentId: "../x" }, { appointmentId: "a".repeat(129) },
    { appointmentId: "appt-1", tenantId: "T2" }, { appointmentId: "appt-1", contactId: "x" },
  ])("refuses the body %j", async (body) => {
    const { deps } = setup();
    expect((await send(deps, post(body))).status).toBe(400);
    expect(deps.read).not.toHaveBeenCalled();
  });

  it("accepts a recurring instance id", async () => {
    const id = "ocQHyuzHvysMo5N5VsXc_1729821600000_1800";
    const { deps } = setup({}, [row({ id })]);
    expect((await send(deps, post({ appointmentId: id }))).body.status).toBe("notified");
  });
});

describe("the happy path", () => {
  it("re-reads the day, claims before the tag, and records the outcome", async () => {
    const { deps, claims } = setup();
    const answer = await send(deps);
    expect(answer).toEqual({ status: 200, body: { status: "notified" } });
    expect(deps.read).toHaveBeenCalledWith("T1", expect.any(Function));
    expect(deps.readAppointmentContact).toHaveBeenCalledWith("T1", { calendarId: "cal-1", appointmentId: "appt-1", startMs: DAY.startMs, endMs: DAY.endMs });
    expect(deps.pulseTag).toHaveBeenCalledWith("T1", "contact-1", false);
    expect(deps.claim.mock.invocationCallOrder[0]).toBeLessThan(deps.pulseTag.mock.invocationCallOrder[0]);
    expect(claims.get("T1|appt-1")).toMatchObject({ actorId: "u1", outcome: "notified" });
  });

  it("passes on that the tag is already there, so it is removed and re-added", async () => {
    const { deps } = setup({ readContactTagState: vi.fn(async () => ({ ok: true as const, hasTag: true })) });
    await send(deps);
    expect(deps.pulseTag).toHaveBeenCalledWith("T1", "contact-1", true);
  });

  it("notifies for an estimate too", async () => {
    const { deps } = setup({}, [row({ calendarName: "Estimates" })]);
    expect((await send(deps)).body.status).toBe("notified");
  });
});

describe("once per job", () => {
  it("a repeat tap or a reload's tap fires nothing and returns the first result", async () => {
    const { deps } = setup();
    await send(deps);
    expect((await send(deps, post())).body.status).toBe("notified");
    expect(deps.pulseTag).toHaveBeenCalledTimes(1);
  });

  it("two users racing fire once", async () => {
    const { deps } = setup();
    const answers = await Promise.all([send(deps, post()), send(deps, post())]);
    expect(deps.pulseTag).toHaveBeenCalledTimes(1);
    expect(deps.claim).toHaveBeenCalledTimes(2);
    expect(answers.map((a) => a.body.status).sort()).toEqual(["notified", "unconfirmed"]);
  });

  it("a second crew member later gets the stored result", async () => {
    const { deps } = setup();
    await send(deps);
    deps.currentUser.mockResolvedValue({ id: "u2", role: "office" as never, tenantId: "T1" });
    expect((await send(deps, post())).body.status).toBe("notified");
    expect(deps.pulseTag).toHaveBeenCalledTimes(1);
  });

  it("a crash after the claim reads as unconfirmed and never fires again", async () => {
    const { deps, claims } = setup();
    claims.set("T1|appt-1", { tenantId: "T1", appointmentId: "appt-1", actorId: "u9", outcome: "pending" });
    expect((await send(deps)).body.status).toBe("unconfirmed");
    expect(deps.pulseTag).not.toHaveBeenCalled();
  });

  it("no answer stays claimed as unconfirmed, with no retry", async () => {
    const { deps, claims } = setup({ pulseTag: vi.fn(async () => "no_answer" as const) });
    expect((await send(deps)).body.status).toBe("unconfirmed");
    expect(claims.get("T1|appt-1")?.outcome).toBe("unconfirmed");
    expect((await send(deps, post())).body.status).toBe("unconfirmed");
    expect(deps.pulseTag).toHaveBeenCalledTimes(1);
  });

  it("a refusal from HighLevel stays claimed as failed, with no retry", async () => {
    const { deps, claims } = setup({ pulseTag: vi.fn(async () => "failed" as const) });
    expect((await send(deps)).body.status).toBe("failed");
    expect(claims.get("T1|appt-1")?.outcome).toBe("failed");
    await send(deps, post());
    expect(deps.pulseTag).toHaveBeenCalledTimes(1);
  });

  it("a tag call that throws reads as unconfirmed", async () => {
    const { deps } = setup({ pulseTag: vi.fn(async () => { throw new Error("boom"); }) });
    expect((await send(deps)).body.status).toBe("unconfirmed");
  });

  it("still reports the true result when saving it fails", async () => {
    const { deps } = setup({ finish: vi.fn(async () => { throw new Error("db"); }) });
    expect((await send(deps)).body.status).toBe("notified");
  });

  it("never fires when the claim cannot be written", async () => {
    const { deps } = setup({ claim: vi.fn(async () => { throw new Error("db"); }) });
    expect((await send(deps)).body).toEqual({ status: "refused", reason: "unavailable" });
    expect(deps.pulseTag).not.toHaveBeenCalled();
  });

  it("never fires when the stored result cannot be read", async () => {
    const { deps } = setup({ readOutcome: vi.fn(async () => { throw new Error("db"); }) });
    expect((await send(deps)).body).toEqual({ status: "refused", reason: "unavailable" });
    expect(deps.pulseTag).not.toHaveBeenCalled();
  });
});

describe("tenant isolation", () => {
  it("keeps claims per tenant and reads only the session's tenant", async () => {
    const { deps } = setup();
    await send(deps);
    deps.currentUser.mockResolvedValue({ id: "u2", role: "owner", tenantId: "T2" });
    expect((await send(deps, post())).body.status).toBe("notified");
    expect(deps.pulseTag).toHaveBeenCalledTimes(2);
    expect(deps.pulseTag).toHaveBeenLastCalledWith("T2", "contact-1", false);
    expect(deps.read).toHaveBeenLastCalledWith("T2", expect.any(Function));
  });

  it("refuses an appointment of another tenant (not in this tenant's day)", async () => {
    const { deps } = setup({}, [row({ id: "mine" })]);
    expect((await send(deps)).body).toEqual({ status: "refused", reason: "not_next" });
    expect(deps.claim).not.toHaveBeenCalled();
    expect(deps.pulseTag).not.toHaveBeenCalled();
  });
});

describe("what never fires", () => {
  const refused = async (deps: MockDeps, reason: string) => {
    expect((await send(deps)).body).toEqual({ status: "refused", reason });
    expect(deps.claim).not.toHaveBeenCalled();
    expect(deps.pulseTag).not.toHaveBeenCalled();
  };

  it("another appointment type", async () => {
    await refused(setup({}, [row({ calendarName: "Team meeting" })]).deps, "wrong_type");
  });

  it("a calendar with no name", async () => {
    await refused(setup({}, [row({ calendarName: null })]).deps, "wrong_type");
  });

  it("a job that is not the next one", async () => {
    const earlier = row({ id: "appt-0", startMs: NOW + 60_000, endMs: NOW + 120_000 });
    await refused(setup({}, [earlier, row()]).deps, "not_next");
  });

  it("a finished job", async () => {
    await refused(setup({}, [row({ status: "showed" })]).deps, "not_next");
  });

  it("a job on another day", async () => {
    await refused(setup({}, [row({ startMs: DAY.endMs + 1000, endMs: DAY.endMs + 2000 })]).deps, "unavailable");
  });

  it("a job whose time has passed", async () => {
    await refused(setup({}, [row({ startMs: NOW - 7_200_000, endMs: NOW - 3_600_000 })]).deps, "past");
  });

  it("a partial day, because next is not certain", async () => {
    await refused(setup({ read: readerOf([row()], { complete: false }) }).deps, "unsure_next");
  });

  it("a failed calendar read", async () => {
    await refused(setup({ read: vi.fn(async () => ({ ok: false, reason: "unavailable" })) as unknown as RoutesReader }).deps, "unavailable");
  });

  it("no contact on the appointment", async () => {
    await refused(setup({ readAppointmentContact: vi.fn(async () => ({ ok: true as const, contactId: null })) }).deps, "no_contact");
  });

  it("the contact lookup failing", async () => {
    await refused(setup({ readAppointmentContact: vi.fn(async () => ({ ok: false as const })) }).deps, "unavailable");
  });

  it("the contact's tags failing to read", async () => {
    await refused(setup({ readContactTagState: vi.fn(async () => ({ ok: false as const })) }).deps, "unavailable");
  });
});

describe("which job may notify", () => {
  const stale = row({ id: "stale", startMs: NOW - 7_200_000, endMs: NOW - 3_600_000 });
  const expectRefused = async (deps: MockDeps, id: string, reason: string) => {
    expect((await send(deps, post({ appointmentId: id }))).body).toEqual({ status: "refused", reason });
    expect(deps.claim).not.toHaveBeenCalled();
    expect(deps.pulseTag).not.toHaveBeenCalled();
  };

  it("a past job never marked done does not stop the next job from notifying", async () => {
    const { deps, claims } = setup({}, [stale, row()]);
    expect((await send(deps)).body.status).toBe("notified");
    expect(deps.pulseTag).toHaveBeenCalledTimes(1);
    expect(deps.claim.mock.invocationCallOrder[0]).toBeLessThan(deps.pulseTag.mock.invocationCallOrder[0]);
    expect(claims.get("T1|appt-1")?.outcome).toBe("notified");
  });

  it("the skipped past job itself is still refused as past", async () => {
    await expectRefused(setup({}, [stale, row()]).deps, "stale", "past");
  });

  it("a crew member running late can notify for a job in progress", async () => {
    const late = row({ startMs: NOW - 600_000, endMs: NOW + 3_000_000 });
    expect((await send(setup({}, [stale, late]).deps)).body.status).toBe("notified");
  });

  it("a job starting at this moment can notify", async () => {
    expect((await send(setup({}, [row({ startMs: NOW, endMs: NOW + 1000 })]).deps)).body.status).toBe("notified");
  });

  it("a job one millisecond before its end can notify", async () => {
    expect((await send(setup({}, [row({ startMs: NOW - 1000, endMs: NOW + 1 })]).deps)).body.status).toBe("notified");
  });

  it("a job ending at this moment is past", async () => {
    await expectRefused(setup({}, [row({ startMs: NOW - 1000, endMs: NOW })]).deps, "appt-1", "past");
  });

  it("a job in progress holds the turn: the one after it is refused", async () => {
    const running = row({ id: "running", startMs: NOW - 600_000, endMs: NOW + 600_000 });
    await expectRefused(setup({}, [running, row()]).deps, "appt-1", "not_next");
  });

  it("the job after a skipped past job is refused when it is not first", async () => {
    const first = row({ id: "first", startMs: NOW + 60_000, endMs: NOW + 120_000 });
    await expectRefused(setup({}, [stale, first, row()]).deps, "appt-1", "not_next");
  });

  it("a wrong-type job in the notify slot is refused and passes the turn to nobody", async () => {
    const meeting = row({ id: "meeting", calendarName: "Team meeting", startMs: NOW + 60_000, endMs: NOW + 120_000 });
    await expectRefused(setup({}, [stale, meeting, row()]).deps, "meeting", "wrong_type");
    await expectRefused(setup({}, [stale, meeting, row()]).deps, "appt-1", "not_next");
  });

  it("a repeat tap after skipping a past job fires once", async () => {
    const { deps } = setup({}, [stale, row()]);
    await send(deps);
    expect((await send(deps, post())).body.status).toBe("notified");
    expect(deps.pulseTag).toHaveBeenCalledTimes(1);
  });

  it("a partial day still refuses, even with a past job skipped", async () => {
    await expectRefused(setup({ read: readerOf([stale, row()], { complete: false }) }).deps, "appt-1", "unsure_next");
  });
});

describe("the page's notify view", () => {
  const ready = { state: "ready" as const, timeZone: "UTC", nextId: "a", partial: false, jobs: [{ id: "a" }, { id: "b" }] as never };
  const readOutcomes = vi.fn(async () => [{ appointmentId: "a", outcome: "notified" }, { appointmentId: "b", outcome: "pending" }]);

  it("is null with the flag off, in View as client and for an admin", async () => {
    const user = { id: "u", role: "owner" as const, tenantId: "T1" };
    expect(await loadNotifyView(user, ready, { isEnabled: () => false, readOutcomes })).toBeNull();
    expect(await loadNotifyView({ ...user, viewing: true }, ready, { isEnabled: () => true, readOutcomes })).toBeNull();
    expect(await loadNotifyView({ ...user, role: "admin" }, ready, { isEnabled: () => true, readOutcomes })).toBeNull();
    expect(await loadNotifyView(null, ready, { isEnabled: () => true, readOutcomes })).toBeNull();
  });

  it("carries stored results, with a pending row as unconfirmed", async () => {
    const view = await loadNotifyView({ id: "u", role: "office", tenantId: "T1" }, ready, { isEnabled: () => true, readOutcomes });
    expect(view).toEqual({ userId: "u", outcomes: { a: "notified", b: "unconfirmed" } });
  });

  it("still shows the toggle when stored results cannot be read", async () => {
    const view = await loadNotifyView({ id: "u", role: "owner", tenantId: "T1" }, ready, {
      isEnabled: () => true,
      readOutcomes: vi.fn(async () => { throw new Error("db"); }),
    });
    expect(view).toEqual({ userId: "u", outcomes: {} });
  });
});
