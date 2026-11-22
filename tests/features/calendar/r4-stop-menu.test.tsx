// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next/navigation", () => ({
  usePathname: () => "/calendar",
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(window.location.search),
}));

import { AppShell, buildBusiness } from "@/features/app-shell";
import { CalendarPage, MOCK_STOPS, calendarReducer, initialState } from "@/features/calendar";
import type { CalendarAction, CalendarState } from "@/features/calendar";

const business = buildBusiness({
  name: "Sample Roofing", owner: "Pat Lee", hours: "Mon - Fri: 9 - 4",
  websiteUrl: "https://www.sample-roofing.test", bookingJobUrl: "https://book.sample-roofing.test/job",
});

// Sunday noon: Tom Becker (8:30 AM) is over, Carlos Mendez (1:30 PM) is still to come.
const NOON = new Date(2026, 10, 22, 12, 0);

const stopButton = (name: string) => {
  const el = Array.from(document.querySelectorAll<HTMLButtonElement>(".fd-cg .fd-ev")).find((b) => b.querySelector(".fd-enm")?.textContent === name);
  if (!el) throw new Error(`no stop ${name}`);
  return el;
};
const detail = () => document.querySelector(".fd-cdet")!;
const labels = () => screen.getAllByRole("menuitem").map((i) => i.textContent);
const openMenu = (name: string) => fireEvent.contextMenu(stopButton(name), { clientX: 200, clientY: 130 });
const press = async (label: string) => {
  fireEvent.click(screen.getByRole("menuitem", { name: label }));
  await act(async () => { await new Promise((r) => setTimeout(r, 5)); });
};
const page = () => <AppShell business={business} searchRows={[]}><CalendarPage /></AppShell>;
const setWidth = (w: number) => Object.defineProperty(window, "innerWidth", { value: w, configurable: true, writable: true });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOON);
  window.history.replaceState(null, "", "/calendar");
  setWidth(1440);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  setWidth(1024);
});

describe("R4-1: the menu on a calendar stop", () => {
  it("a past stop offers Open only", () => {
    render(page());
    expect(stopButton("Tom Becker").className).toContain("is-past");
    openMenu("Tom Becker");
    expect(labels()).toEqual(["Open"]);
  });

  it("another stop offers Open, Reschedule and a red Delete, named for the stop", () => {
    render(page());
    openMenu("Carlos Mendez");
    expect(labels()).toEqual(["Open", "Reschedule", "Delete"]);
    expect(screen.getByRole("menuitem", { name: "Delete" }).className).toContain("is-bad");
    expect(screen.getByRole("menu", { name: "Actions for Carlos Mendez" })).toBeInTheDocument();
  });

  it("Open opens the stop", async () => {
    render(page());
    openMenu("Carlos Mendez");
    await press("Open");
    expect(detail().className).toContain("is-on");
    expect(detail().querySelector(".fd-dn")?.textContent).toBe("Carlos Mendez");
  });

  it("Reschedule opens the stop with the time picker", async () => {
    render(page());
    openMenu("Carlos Mendez");
    await press("Reschedule");
    expect(detail().querySelector(".fd-dn")?.textContent).toBe("Carlos Mendez");
    expect(detail().querySelector(".fd-dpk")!.className).not.toContain("is-off");
  });

  it("Reschedule keeps a stop open that was already open", async () => {
    const user = userEvent.setup();
    render(page());
    await user.click(stopButton("Carlos Mendez"));
    openMenu("Carlos Mendez");
    await press("Reschedule");
    expect(detail().className).toContain("is-on");
    expect(detail().querySelector(".fd-dpk")!.className).not.toContain("is-off");
  });

  it("Delete opens the stop and asks first", async () => {
    render(page());
    openMenu("Carlos Mendez");
    await press("Delete");
    expect(detail().querySelector(".fd-dn")?.textContent).toBe("Carlos Mendez");
    await waitFor(() => expect(document.querySelector(".fd-cf")!.className).not.toContain("is-off"));
  });

  it("opens from the menu key", () => {
    render(page());
    fireEvent.keyDown(stopButton("Carlos Mendez"), { key: "ContextMenu" });
    expect(labels()).toEqual(["Open", "Reschedule", "Delete"]);
  });

  it("opens on a long press, and a swipe does nothing", async () => {
    setWidth(390);
    render(page());
    const el = stopButton("Carlos Mendez");
    const at = (x: number) => [{ clientX: x, clientY: 200 }];
    fireEvent.touchStart(el, { touches: at(100), changedTouches: at(100) });
    fireEvent.touchMove(el, { touches: at(300), changedTouches: at(300) });
    expect(el.style.transform).toBe("");
    fireEvent.touchEnd(el, { touches: [], changedTouches: at(300) });
    expect(detail().className).toContain("is-off");
    expect(screen.queryByRole("menu")).toBeNull();
    fireEvent.touchStart(el, { touches: at(100), changedTouches: at(100) });
    await act(async () => { await new Promise((r) => setTimeout(r, 540)); });
    expect(labels()).toEqual(["Open", "Reschedule", "Delete"]);
  });
});

describe("R4-7: Undo of deleting a stop you added", () => {
  const run = (s: CalendarState, ...actions: CalendarAction[]) => actions.reduce(calendarReducer, s);

  it("leaves another stop that was opened meanwhile open", () => {
    const placement = { week: 0, day: 2, start: 4 };
    const booked = MOCK_STOPS[0].id;
    let s = run(initialState(MOCK_STOPS, NOON), { type: "openAdd", kind: "E" }, { type: "setAddName", name: "Sam Ortiz" }, { type: "submitAdd", placement });
    s = run(s, { type: "pick", id: "added-1" }, { type: "askDelete", id: "added-1" }, { type: "confirmDelete" }, { type: "pick", id: booked }, { type: "undoDelete" });
    expect(s.deleted["added-1"]).toBeUndefined();
    expect(s.selId).toBe(booked);
  });

  it("brings it back without opening it", () => {
    const placement = { week: 0, day: 2, start: 4 };
    let s = run(initialState(MOCK_STOPS, NOON), { type: "openAdd", kind: "E" }, { type: "setAddName", name: "Sam Ortiz" }, { type: "submitAdd", placement });
    s = run(s, { type: "pick", id: "added-1" }, { type: "askDelete", id: "added-1" }, { type: "confirmDelete" }, { type: "undoDelete" });
    expect(s.deleted["added-1"]).toBeUndefined();
    expect(s).toMatchObject({ selId: null, wk: 0, sd: 2, lastDelete: null });
  });

  it("a booked stop still opens again", () => {
    const id = MOCK_STOPS[0].id;
    const s = run(initialState(MOCK_STOPS, NOON), { type: "askDelete", id }, { type: "confirmDelete" }, { type: "undoDelete" });
    expect(s.selId).toBe(id);
  });
});
