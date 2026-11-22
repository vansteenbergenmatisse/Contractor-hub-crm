// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next/navigation", () => ({
  usePathname: () => "/calendar",
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(window.location.search),
}));

import { AppShell, buildBusiness, useKeptReducer } from "@/features/app-shell";
import { CalendarPage, MOCK_STOPS, calendarReducer, initialState, mockStopsFor, useStopDrag } from "@/features/calendar";
import type { CalendarState } from "@/features/calendar";

const business = buildBusiness({
  name: "Sample Roofing", owner: "Pat Lee", hours: "Mon - Fri: 9 - 4",
  websiteUrl: "https://www.sample-roofing.test", bookingJobUrl: "https://book.sample-roofing.test/job",
});

// Sunday, Nov 22 2026, 7:30 AM.
const SUNDAY = new Date(2026, 10, 22, 7, 30);
const lindaId = MOCK_STOPS.find((s) => s.name === "Linda Park")!.id;

const stopButton = (name: string) => {
  const el = Array.from(document.querySelectorAll<HTMLButtonElement>(".fd-cg .fd-ev")).find((b) => b.querySelector(".fd-enm")?.textContent === name);
  if (!el) throw new Error(`no stop ${name}`);
  return el;
};
const detail = () => document.querySelector(".fd-cdet")!;
const sheet = () => document.querySelector(".fd-cnew")!;
const page = (props: Parameters<typeof CalendarPage>[0] = {}) => (
  <AppShell business={business} searchRows={[]}>
    <CalendarPage {...props} />
  </AppShell>
);
const setWidth = (w: number) => Object.defineProperty(window, "innerWidth", { value: w, configurable: true, writable: true });
const touch = (el: Element, type: "touchStart" | "touchEnd", x: number, y: number) => {
  const list = [{ clientX: x, clientY: y }];
  act(() => {
    fireEvent[type](el, type === "touchEnd" ? { touches: [], changedTouches: list } : { touches: list, changedTouches: list });
  });
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(SUNDAY);
  window.history.replaceState(null, "", "/calendar");
  setWidth(1440);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  setWidth(1024);
});

describe("a click on free time (computer, week)", () => {
  it("closes the open stop, as the design does", async () => {
    const user = userEvent.setup();
    render(page());
    await user.click(stopButton("Linda Park"));
    expect(detail().className).toContain("is-on");
    await user.click(document.querySelector(".fd-cg")!);
    expect(detail().className).toContain("is-off");
  });

  it("does not close it on a phone", async () => {
    setWidth(390);
    const user = userEvent.setup();
    render(page());
    await user.click(stopButton("Linda Park"));
    await user.click(document.querySelector(".fd-cg")!);
    expect(detail().className).toContain("is-on");
  });
});

describe("the tab bar and the action bar", () => {
  it("stay when a stop is open (Calendar is not a pushed screen in the design)", async () => {
    const user = userEvent.setup();
    render(page());
    await user.click(stopButton("Linda Park"));
    expect(document.querySelector(".fx-tcap")!.className).not.toContain("fd-hid");
    expect(document.querySelector(".fx-acc")!.className).not.toContain("fd-hid");
  });

  it("hides the action bar while the add sheet is open", async () => {
    const user = userEvent.setup();
    render(page());
    expect(document.querySelector(".fx-acc")!.className).not.toContain("fd-hid");
    await user.click(screen.getAllByRole("button", { name: "Add estimate" })[0]);
    expect(document.querySelector(".fx-acc")!.className).toContain("fd-hid");
    await user.click(sheet().querySelector<HTMLButtonElement>(".fd-btn.is-plain")!);
    expect(document.querySelector(".fx-acc")!.className).not.toContain("fd-hid");
  });

  it("keeps the action bar buttons mounted while hidden, so adding from Estimate gives focus back to it", async () => {
    setWidth(390);
    const user = userEvent.setup();
    render(page());
    const bar = () => document.querySelector<HTMLElement>(".fx-acc")!;
    const estimate = Array.from(bar().querySelectorAll<HTMLButtonElement>("button")).find((b) => b.textContent === "Estimate")!;
    await user.click(estimate);
    expect(bar().className).toContain("fd-hid");
    expect(estimate.isConnected).toBe(true);
    await user.type(screen.getByLabelText("Customer name"), "Sam Ortiz");
    await user.click(sheet().querySelector<HTMLButtonElement>(".fd-pna .fd-btn:not(.is-plain)")!);
    expect(sheet().className).toContain("is-off");
    expect(bar().className).not.toContain("fd-hid");
    expect(estimate).toHaveFocus();
  });

  it("gives focus back to the bar's Job button after Cancel", async () => {
    setWidth(390);
    const user = userEvent.setup();
    render(page());
    const job = Array.from(document.querySelectorAll<HTMLButtonElement>(".fx-acc button")).find((b) => b.textContent === "Job")!;
    await user.click(job);
    await user.click(sheet().querySelector<HTMLButtonElement>(".fd-btn.is-plain")!);
    expect(job).toHaveFocus();
  });
});

describe("the add sheet", () => {
  it("closes on Escape from anywhere and gives focus back to the button that opened it", async () => {
    const user = userEvent.setup();
    render(page());
    const opener = screen.getAllByRole("button", { name: "Add estimate" })[0];
    await user.click(opener);
    expect(screen.getByLabelText("Customer name")).toHaveFocus();
    (document.activeElement as HTMLElement).blur();
    await user.keyboard("{Escape}");
    expect(sheet().className).toContain("is-off");
    expect(opener).toHaveFocus();
  });

  it("gives focus back after Cancel too", async () => {
    const user = userEvent.setup();
    render(page());
    const opener = screen.getAllByRole("button", { name: "Add job" })[0];
    await user.click(opener);
    await user.click(sheet().querySelector<HTMLButtonElement>(".fd-btn.is-plain")!);
    expect(opener).toHaveFocus();
  });

  it("keeps Tab inside the sheet", async () => {
    const user = userEvent.setup();
    render(page());
    await user.click(screen.getAllByRole("button", { name: "Add estimate" })[0]);
    for (let k = 0; k < 8; k += 1) {
      await user.tab();
      expect(sheet().contains(document.activeElement)).toBe(true);
    }
    await user.tab({ shift: true });
    expect(sheet().contains(document.activeElement)).toBe(true);
  });
});

describe("the day strip (phone)", () => {
  it("swipe left goes to the week after, right to the week before", () => {
    setWidth(390);
    render(page());
    const strip = document.querySelector(".fd-cdays")!;
    touch(strip, "touchStart", 300, 200);
    touch(strip, "touchEnd", 150, 205);
    expect(screen.getByText(/Nov 29 – Dec 5, 2026/)).toBeInTheDocument();
    touch(strip, "touchStart", 100, 200);
    touch(strip, "touchEnd", 260, 200);
    touch(strip, "touchStart", 100, 200);
    touch(strip, "touchEnd", 260, 200);
    expect(screen.getByText(/Nov 15 – 21, 2026/)).toBeInTheDocument();
  });

  it("does nothing on a computer", () => {
    render(page());
    const strip = document.querySelector(".fd-cdays")!;
    touch(strip, "touchStart", 300, 200);
    touch(strip, "touchEnd", 150, 205);
    expect(screen.queryByText(/Nov 29 – Dec 5, 2026/)).toBeNull();
  });
});

describe("a repeat pick of the same search result", () => {
  it("opens the stop again after it was closed", async () => {
    const user = userEvent.setup();
    window.history.replaceState(null, "", `/calendar?row=${lindaId}`);
    render(page({ row: lindaId }));
    expect(detail().className).toContain("is-on");
    await user.keyboard("{Escape}");
    expect(detail().className).toContain("is-off");
    act(() => {
      window.dispatchEvent(new CustomEvent("fx:row-pick", { detail: lindaId }));
    });
    expect(detail().className).toContain("is-on");
    expect(detail().querySelector(".fd-dn")?.textContent).toBe("Linda Park");
  });
});

describe("the kept page state", () => {
  it("lives under the key \"calendar\" in the shell's store", async () => {
    let seen: CalendarState | null = null;
    function Probe() {
      const [st] = useKeptReducer("calendar", calendarReducer, SUNDAY, (at: Date) => initialState(mockStopsFor(at), at));
      seen = st;
      return null;
    }
    // A swipe earlier in this file blocks clicks for 450 ms (Date is frozen here): step past that.
    vi.setSystemTime(new Date(SUNDAY.getTime() + 1000));
    const user = userEvent.setup();
    const { rerender } = render(page());
    await user.click(screen.getAllByRole("button", { name: "The week after" })[0]);
    rerender(<AppShell business={business} searchRows={[]}><CalendarPage /><Probe /></AppShell>);
    expect(seen).not.toBeNull();
    expect(seen!.wk).toBe(1);
  });
});

describe("dragging a stop: a second press", () => {
  it("ends the drag already under way: its stop goes back and only the second one drops", () => {
    const onDrop = vi.fn();
    const grid = document.createElement("div");
    const first = document.createElement("button");
    const second = document.createElement("button");
    document.body.append(grid, first, second);
    grid.getBoundingClientRect = () => ({ left: 0, top: 0, width: 700, height: 600, right: 700, bottom: 600, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
    grid.style.gridTemplateColumns = "40px 100px 100px 100px 100px 100px 100px 100px";
    grid.style.gridTemplateRows = "26px";
    const { result } = renderHook(() => useStopDrag({ gridRef: { current: grid }, enabled: true, onDrop }));
    act(() => {
      result.current.onPointerDown({ button: 0, clientX: 10, clientY: 10, currentTarget: first } as never, "stop-a", 2);
    });
    document.dispatchEvent(new MouseEvent("pointermove", { clientX: 80, clientY: 80 }));
    expect(first.style.transform).not.toBe("");
    act(() => {
      result.current.onPointerDown({ button: 0, clientX: 300, clientY: 100, currentTarget: second } as never, "stop-b", 2);
    });
    expect(first.style.transform).toBe("");
    document.dispatchEvent(new MouseEvent("pointermove", { clientX: 360, clientY: 160 }));
    expect(first.style.transform).toBe("");
    document.dispatchEvent(new MouseEvent("pointerup", { clientX: 360, clientY: 160 }));
    expect(onDrop).toHaveBeenCalledTimes(1);
    expect(onDrop.mock.calls[0][0]).toBe("stop-b");
    first.remove(); second.remove(); grid.remove();
  });
});
