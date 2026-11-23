// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  usePathname: () => "/routes",
  useRouter: () => ({ push: vi.fn(), refresh }),
  useSearchParams: () => null,
}));

import { RoutesLivePage, RoutesSkeleton, type RouteJob, type RoutesResult } from "@/features/routes";

const job = (over: Partial<RouteJob> = {}): RouteJob => ({
  id: "a", name: "Pat Test", service: "Visits", address: "1 Test St", coords: null,
  mapsUrl: "https://www.google.com/maps/dir/?api=1&destination=1%20Test%20St&travelmode=driving",
  timeLabel: "1:00 PM to 2:00 PM", statusLabel: "Confirmed", done: false, pastTime: false, ...over,
});
const ready = (jobs: RouteJob[], over: Partial<Extract<RoutesResult, { state: "ready" }>> = {}): RoutesResult => ({
  state: "ready", timeZone: "America/New_York", jobs, nextId: jobs.find((j) => !j.done)?.id ?? null, partial: false, ...over,
});

type Watch = { ok: PositionCallback; fail: PositionErrorCallback };
let watches: Map<number, Watch>;
let clearWatch: ReturnType<typeof vi.fn>;
let watchPosition: ReturnType<typeof vi.fn>;
const fix = (latitude: number, longitude: number) => ({ coords: { latitude, longitude, accuracy: 20 }, timestamp: 1 }) as unknown as GeolocationPosition;
const failure = (code: number) => ({ code, message: "x", PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 }) as GeolocationPositionError;
const setGeo = (value: unknown) => Object.defineProperty(navigator, "geolocation", { configurable: true, value });
const setHidden = (hidden: boolean) => {
  Object.defineProperty(document, "hidden", { configurable: true, value: hidden });
  act(() => { document.dispatchEvent(new Event("visibilitychange")); });
};
const tapUse = () => fireEvent.click(screen.getByRole("button", { name: "Use my location" }));
const current = () => [...watches.values()].at(-1)!;

beforeEach(() => {
  watches = new Map();
  let id = 0;
  watchPosition = vi.fn((ok: PositionCallback, fail: PositionErrorCallback) => { id += 1; watches.set(id, { ok, fail }); return id; });
  clearWatch = vi.fn((n: number) => { watches.delete(n); });
  setGeo({ watchPosition, clearWatch });
  Object.defineProperty(document, "hidden", { configurable: true, value: false });
});

afterEach(() => {
  cleanup();
  refresh.mockClear();
  vi.restoreAllMocks();
});

describe("the jobs", () => {
  it("makes the next job prominent, with a Start link that leaves the app", () => {
    render(<RoutesLivePage result={ready([job({ id: "d", name: "Done Dan", done: true, statusLabel: "Showed" }), job(), job({ id: "b", name: "Later Lee" })])} />);
    const next = screen.getByRole("region", { name: "Next job" });
    expect(within(next).getByRole("heading", { name: "Pat Test" })).toBeTruthy();
    expect(within(next).getByText("1:00 PM to 2:00 PM")).toBeTruthy();
    expect(within(next).getByText("1 Test St")).toBeTruthy();
    const start = within(next).getByRole("link", { name: "Start directions to Pat Test" });
    expect(start.getAttribute("href")).toBe(job().mapsUrl);
    expect(start.getAttribute("target")).toBe("_blank");
    expect(start.getAttribute("rel")).toBe("noopener noreferrer");
    expect(start.className).toContain("is-fill");
  });

  it("lists every job of the day in order, and a done job has no Start", () => {
    render(<RoutesLivePage result={ready([job({ id: "d", name: "Done Dan", done: true, statusLabel: "Showed" }), job(), job({ id: "b", name: "Later Lee" })])} />);
    const list = screen.getByRole("list", { name: "Today's jobs" });
    const rows = within(list).getAllByRole("listitem");
    expect(rows.map((r) => within(r).getByText(/Dan|Pat|Lee/).textContent)).toEqual(["Done Dan", "Pat Test", "Later Lee"]);
    expect(within(rows[0]).getByText("Showed")).toBeTruthy();
    expect(within(rows[0]).queryByRole("link")).toBeNull();
    expect(within(rows[2]).getByRole("link", { name: "Start directions to Later Lee" })).toBeTruthy();
  });

  it("says so when a job has no address, with no Start link", () => {
    render(<RoutesLivePage result={ready([job({ address: null, mapsUrl: null })])} />);
    const next = screen.getByRole("region", { name: "Next job" });
    expect(within(next).getByText("No address on this job.")).toBeTruthy();
    expect(within(next).queryByRole("link")).toBeNull();
  });

  it("says a past job is not marked done instead of guessing", () => {
    render(<RoutesLivePage result={ready([job({ pastTime: true })])} />);
    expect(screen.getByText("This job's time has passed, but it isn't marked done.")).toBeTruthy();
  });

  it("says when no open job is left", () => {
    render(<RoutesLivePage result={ready([job({ done: true, statusLabel: "Showed" })])} />);
    expect(screen.getByText("No open jobs left today.")).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Next job" })).toBeNull();
  });

  it("warns on a partial read that the next job may differ", () => {
    render(<RoutesLivePage result={ready([job()], { partial: true })} />);
    expect(screen.getByText("Some jobs may be missing from today, so the next job could be a different one.")).toBeTruthy();
  });

  it("shows the time zone", () => {
    render(<RoutesLivePage result={ready([job()])} />);
    expect(screen.getByText(/Times are in America\/New_York\./)).toBeTruthy();
  });
});

describe("the page states", () => {
  it("loading", () => {
    render(<RoutesSkeleton />);
    expect(screen.getByRole("heading", { level: 1, name: "Routes" })).toBeTruthy();
    expect(screen.getByRole("status", { name: "Loading your jobs" })).toBeTruthy();
  });

  it("empty, in both wordings", () => {
    const { unmount } = render(<RoutesLivePage result={{ state: "empty", timeZone: "UTC", reason: "no-appointments" }} />);
    expect(screen.getByText("Nothing booked today.")).toBeTruthy();
    unmount();
    render(<RoutesLivePage result={{ state: "empty", timeZone: "UTC", reason: "no-calendars" }} />);
    expect(screen.getByText("No calendars are set up yet.")).toBeTruthy();
  });

  it("reconnect has no retry", () => {
    render(<RoutesLivePage result={{ state: "reconnect" }} />);
    expect(screen.getByRole("alert").textContent).toContain("Your CRM connection needs attention.");
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  });

  it("unavailable can retry", () => {
    render(<RoutesLivePage result={{ state: "unavailable" }} />);
    expect(screen.getByRole("alert").textContent).toContain("Your jobs can't load right now.");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});

describe("location", () => {
  const withCoords = () => ready([job({ coords: { lat: 40.7128, lng: -74.006 } })]);

  it("never asks until the button is tapped, and says it works while the page is open", () => {
    render(<RoutesLivePage result={withCoords()} />);
    expect(watchPosition).not.toHaveBeenCalled();
    expect(screen.getByText(/Location works while this page is open/)).toBeTruthy();
  });

  it("shows an approximate distance after a fix", () => {
    render(<RoutesLivePage result={withCoords()} />);
    tapUse();
    expect(watchPosition).toHaveBeenCalledTimes(1);
    act(() => current().ok(fix(40.7128, -74.006)));
    expect(screen.getByText("Less than 0.1 mi in a straight line (approximate)")).toBeTruthy();
  });

  it("says plainly when a job's address can't give a distance", () => {
    render(<RoutesLivePage result={ready([job()])} />);
    tapUse();
    act(() => current().ok(fix(40, -74)));
    expect(screen.getByText("Location is on. Distance isn't available for this address.")).toBeTruthy();
  });

  it("never sends, stores or logs the position", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    const logs = [vi.spyOn(console, "log"), vi.spyOn(console, "info"), vi.spyOn(console, "warn"), vi.spyOn(console, "error")];
    render(<RoutesLivePage result={withCoords()} />);
    tapUse();
    act(() => current().ok(fix(41.5, -73.5)));
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(setItem).not.toHaveBeenCalled();
    logs.forEach((log) => expect(log).not.toHaveBeenCalled());
    expect(document.documentElement.outerHTML).not.toContain("41.5");
  });

  it("stops watching while hidden, drops the fix, and resumes when visible", () => {
    render(<RoutesLivePage result={withCoords()} />);
    tapUse();
    act(() => current().ok(fix(40.7128, -74.006)));
    setHidden(true);
    expect(clearWatch).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/\(approximate\)/)).toBeNull();
    setHidden(false);
    expect(watchPosition).toHaveBeenCalledTimes(2);
  });

  it("stops on Stop and on leaving the page", () => {
    const { unmount } = render(<RoutesLivePage result={withCoords()} />);
    tapUse();
    act(() => current().ok(fix(40, -74)));
    fireEvent.click(screen.getByRole("button", { name: "Stop using location" }));
    expect(clearWatch).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Use my location" })).toBeTruthy();
    tapUse();
    unmount();
    expect(clearWatch).toHaveBeenCalledTimes(2);
  });

  it("handles denied", () => {
    render(<RoutesLivePage result={withCoords()} />);
    tapUse();
    act(() => current().fail(failure(1)));
    expect(screen.getByRole("alert").textContent).toContain("Location is blocked");
    expect(clearWatch).toHaveBeenCalledTimes(1);
  });

  it.each([2, 3])("handles unavailable (code %i) with a retry", (code) => {
    render(<RoutesLivePage result={withCoords()} />);
    tapUse();
    act(() => current().fail(failure(code)));
    expect(screen.getByRole("alert").textContent).toContain("Your location can't be found right now.");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(watchPosition).toHaveBeenCalledTimes(2);
  });

  it("handles a browser without location", () => {
    setGeo(undefined);
    render(<RoutesLivePage result={withCoords()} />);
    tapUse();
    expect(screen.getByRole("alert").textContent).toContain("This browser can't share a location.");
  });
});
