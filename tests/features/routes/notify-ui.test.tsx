// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/routes",
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => null,
}));

import { RoutesLivePage, type RouteJob, type RoutesNotifyView, type RoutesResult } from "@/features/routes";

const LABEL = "Notify the client when you start";
const job = (over: Partial<RouteJob> = {}): RouteJob => ({
  id: "a", name: "Pat Test", service: "Jobs", address: "1 Test St", coords: null,
  mapsUrl: "https://www.google.com/maps/dir/?api=1&destination=1%20Test%20St&travelmode=driving",
  timeLabel: "1:00 PM to 2:00 PM", statusLabel: "Confirmed", done: false, pastTime: false, ...over,
});
const ready = (jobs: RouteJob[]): RoutesResult => ({ state: "ready", timeZone: "UTC", jobs, nextId: jobs.find((j) => !j.done)?.id ?? null, partial: false });
const view = (over: Partial<RoutesNotifyView> = {}): RoutesNotifyView => ({ userId: "u1", outcomes: {}, ...over });
const answer = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const toggle = () => screen.getByRole("switch", { name: LABEL });
const start = (name = "Pat Test") => within(screen.getByRole("region", { name: "Next job" })).getByRole("link", { name: `Start directions to ${name}` });
const tap = async (link: HTMLElement) => { await act(async () => { fireEvent.click(link); await Promise.resolve(); }); };

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  localStorage.clear();
  fetchMock = vi.fn(async () => answer({ status: "notified" }));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("the toggle", () => {
  it("is not shown when the flag is off or in View as client (no view)", () => {
    render(<RoutesLivePage result={ready([job()])} notify={null} />);
    expect(screen.queryByRole("switch")).toBeNull();
  });

  it("is off by default and a Start sends nothing", async () => {
    render(<RoutesLivePage result={ready([job()])} notify={view()} />);
    expect(toggle().getAttribute("aria-checked")).toBe("false");
    await tap(start());
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("is remembered per user on this device", () => {
    const first = render(<RoutesLivePage result={ready([job()])} notify={view()} />);
    fireEvent.click(toggle());
    expect(toggle().getAttribute("aria-checked")).toBe("true");
    first.unmount();
    const again = render(<RoutesLivePage result={ready([job()])} notify={view()} />);
    expect(toggle().getAttribute("aria-checked")).toBe("true");
    again.unmount();
    render(<RoutesLivePage result={ready([job()])} notify={view({ userId: "u2" })} />);
    expect(toggle().getAttribute("aria-checked")).toBe("false");
  });

  it("still works when storage throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    render(<RoutesLivePage result={ready([job()])} notify={view()} />);
    expect(toggle().getAttribute("aria-checked")).toBe("false");
    fireEvent.click(toggle());
    expect(toggle().getAttribute("aria-checked")).toBe("true");
    vi.restoreAllMocks();
  });
});

describe("Start with the toggle on", () => {
  const on = (result = ready([job()]), notify = view()) => {
    render(<RoutesLivePage result={result} notify={notify} />);
    fireEvent.click(toggle());
  };

  it("keeps the real Maps link and does not block it", async () => {
    on();
    const link = start();
    expect(link.getAttribute("href")).toBe(job().mapsUrl);
    expect(link.getAttribute("target")).toBe("_blank");
    const click = new MouseEvent("click", { bubbles: true, cancelable: true });
    await act(async () => { link.dispatchEvent(click); await Promise.resolve(); });
    expect(click.defaultPrevented).toBe(false);
  });

  it("sends only the appointment id, once, and shows Client notified", async () => {
    on();
    await tap(start());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/routes/notify");
    expect(init.method).toBe("POST");
    expect(init.keepalive).toBe(true);
    expect(JSON.parse(init.body as string)).toEqual({ appointmentId: "a" });
    expect(await screen.findByText("Client notified")).toBeTruthy();
  });

  it("a double tap sends once", async () => {
    on();
    const link = start();
    await act(async () => { fireEvent.click(link); fireEvent.click(link); await Promise.resolve(); });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("a tap after a result sends nothing", async () => {
    on();
    await tap(start());
    await screen.findByText("Client notified");
    await tap(start());
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("a stored result from before the reload shows and sends nothing", async () => {
    on(ready([job()]), view({ outcomes: { a: "unconfirmed" } }));
    expect(screen.getByText("Not sure if notified")).toBeTruthy();
    await tap(start());
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    [{ status: "failed" }, 200, "Could not notify"],
    [{ status: "unconfirmed" }, 200, "Not sure if notified"],
    [{ status: "refused", reason: "no_contact" }, 200, "Could not notify"],
    [{ error: "too_many" }, 429, "Could not notify"],
    [{ error: "failed" }, 500, "Not sure if notified"],
  ])("shows the result of %j", async (body, status, text) => {
    fetchMock.mockResolvedValue(answer(body, status));
    on();
    await tap(start());
    expect(await screen.findByText(text)).toBeTruthy();
  });

  it("gives the plain reason for a refusal", async () => {
    fetchMock.mockResolvedValue(answer({ status: "refused", reason: "no_contact" }));
    on();
    await tap(start());
    expect(await screen.findByText("This job has no contact to notify.")).toBeTruthy();
  });

  it("a lost connection reads as not sure, and Maps still opened", async () => {
    fetchMock.mockRejectedValue(new Error("offline"));
    on();
    await tap(start());
    expect(await screen.findByText("Not sure if notified")).toBeTruthy();
    expect(start().getAttribute("href")).toBe(job().mapsUrl);
  });

  it("a refusal can be tried again, because nothing was sent", async () => {
    fetchMock.mockResolvedValueOnce(answer({ status: "refused", reason: "unavailable" }));
    on();
    await tap(start());
    await screen.findByText("Could not notify");
    await tap(start());
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("on another calendar: says why and sends nothing", async () => {
    on(ready([job({ service: "Team meeting" })]));
    expect(screen.getByText("Only calendars named Job or Estimate can notify a client.")).toBeTruthy();
    await tap(start());
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("a later job's Start never notifies", async () => {
    on(ready([job(), job({ id: "b", name: "Later Lee" })]));
    const list = screen.getByRole("list", { name: "Today's jobs" });
    await tap(within(list).getByRole("link", { name: "Start directions to Later Lee" }));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("a finished job keeps its stored result on its row", () => {
    render(<RoutesLivePage result={ready([job({ done: true, statusLabel: "Showed" }), job({ id: "b", name: "Later Lee" })])} notify={view({ outcomes: { a: "notified" } })} />);
    const row = within(screen.getByRole("list", { name: "Today's jobs" })).getAllByRole("listitem")[0];
    expect(within(row).getByText("Client notified")).toBeTruthy();
  });
});
