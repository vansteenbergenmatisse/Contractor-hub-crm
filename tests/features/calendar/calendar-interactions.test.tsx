// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { act, cleanup, render, renderHook, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next/navigation", () => ({
  usePathname: () => "/calendar",
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(window.location.search),
}));

import { AppShell, buildBusiness } from "@/features/app-shell";
import { CalendarPage, MOCK_STOPS, mockStopsFor, useStopDrag } from "@/features/calendar";

const business = buildBusiness({
  name: "Sample Roofing", owner: "Pat Lee", hours: "Mon - Fri: 9 - 4",
  websiteUrl: "https://www.sample-roofing.test", bookingJobUrl: "https://book.sample-roofing.test/job",
});

// Sunday, Nov 22 2026, 7:30 AM: a day the design never shows as today.
const SUNDAY = new Date(2026, 10, 22, 7, 30);

const stopButton = (name: string) => {
  const el = Array.from(document.querySelectorAll<HTMLButtonElement>(".fd-cg .fd-ev")).find((b) => b.querySelector(".fd-enm")?.textContent === name);
  if (!el) throw new Error(`no stop ${name}`);
  return el;
};
const detail = () => document.querySelector(".fd-cdet")!;
const dialog = () => document.querySelector(".fd-cf")!;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(SUNDAY);
  window.history.replaceState(null, "", "/calendar");
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const page = (props: Parameters<typeof CalendarPage>[0] = {}) => (
  <AppShell business={business} searchRows={[]}>
    <CalendarPage {...props} />
  </AppShell>
);

describe("Calendar today agrees with the Today page", () => {
  it("puts the design's today stops in the real today's column, keeping each stop's distance from today", () => {
    const placed = mockStopsFor(SUNDAY);
    const at = (name: string) => placed.find((s) => s.name === name)!;
    for (const name of ["Tom Becker", "Linda Park", "Carlos Mendez", "Owen Fletcher"]) {
      expect(at(name)).toMatchObject({ week: 0, day: 0 });
    }
    expect(at("Tom Becker").start).toBe(3); // 8:30 AM, as Today says
    expect(at("Whitmore Dental")).toMatchObject({ week: -1, day: 6 }); // "booked for yesterday"
    expect(at("Sam Whitaker")).toMatchObject({ week: 0, day: 3 }); // three days after today, as in the design
    expect(placed.map((s) => s.id)).toEqual(MOCK_STOPS.map((s) => s.id));
  });

  it("leaves the design's own week alone when today is a Friday", () => {
    const friday = new Date(2026, 10, 20, 10, 0);
    expect(mockStopsFor(friday).map(({ week, day }) => [week, day])).toEqual(MOCK_STOPS.map(({ week, day }) => [week, day]));
  });

  it("shows today's four stops on the real today, never Nothing booked", () => {
    render(page());
    expect(screen.getByText("Sunday, Nov 22 · Today")).toBeInTheDocument();
    expect(screen.getByText("4 stops: 3 estimates, 1 job")).toBeInTheDocument();
    expect(stopButton("Tom Becker").className).toContain("is-d0 is-t3");
    expect(screen.queryByText("Nothing booked")).toBeNull();
  });
});

describe("the stop detail", () => {
  it("closes on Escape and gives focus back to the stop", async () => {
    const user = userEvent.setup();
    render(page());
    await user.click(stopButton("Linda Park"));
    expect(detail().className).toContain("is-on");
    await user.keyboard("{Escape}");
    expect(detail().className).toContain("is-off");
    expect(stopButton("Linda Park")).toHaveFocus();
  });

  it("closes with its X and gives focus back to the stop", async () => {
    const user = userEvent.setup();
    render(page());
    await user.click(stopButton("Carlos Mendez"));
    await user.click(detail().querySelector<HTMLButtonElement>(".fd-dx")!);
    expect(detail().className).toContain("is-off");
    expect(stopButton("Carlos Mendez")).toHaveFocus();
  });

  it("opens beside the stop as the design places it: on the other side of the grid", async () => {
    const user = userEvent.setup();
    render(page());
    await user.click(stopButton("Linda Park")); // Sunday: the panel sits on the right
    expect(detail().className).toBe("fd-cdet is-on is-o8");
  });
});

describe("the delete question", () => {
  it("keeps Tab inside, closes on Escape without closing the detail, and returns focus", async () => {
    const user = userEvent.setup();
    render(page());
    await user.click(stopButton("Linda Park"));
    const del = detail().querySelector<HTMLButtonElement>(".fd-ddel")!;
    await user.click(del);
    expect(dialog().className).toBe("fd-cf");
    const buttons = Array.from(dialog().querySelectorAll<HTMLButtonElement>("button")).filter((b) => !b.classList.contains("is-off"));
    expect(buttons[0]).toHaveFocus();
    await user.tab({ shift: true });
    expect(buttons.at(-1)).toHaveFocus();
    await user.tab();
    expect(buttons[0]).toHaveFocus();
    for (let k = 0; k < buttons.length + 2; k += 1) {
      await user.tab();
      expect(dialog().contains(document.activeElement)).toBe(true);
    }
    await user.keyboard("{Escape}");
    expect(dialog().className).toContain("is-off");
    expect(detail().className).toContain("is-on");
    expect(del).toHaveFocus();
  });
});

describe("the sync and booking lines", () => {
  it("shows the design's wording, not an invented sentence, and the booking link with Copy link", async () => {
    const user = userEvent.setup();
    render(page());
    expect(document.body.textContent).not.toContain("The calendar this syncs with shows here once it can be read.");
    expect(screen.getByText("Not available yet")).toBeInTheDocument();
    expect(document.querySelector(".fd-csynct")?.textContent).toContain("Connect your calendar in Settings.");
    const bk = document.querySelector(".fd-cbk")!;
    expect(bk.tagName).toBe("DIV"); // the design's .fd-cbk margin applies (a <p> loses it to the p reset)
    expect(bk.textContent).toContain("book.sample-roofing.test/job");
    await user.click(screen.getByRole("button", { name: "Copy link" }));
    expect(screen.getByRole("button", { name: "Copied" })).toBeInTheDocument();
  });

  it("shows no link and no Copy link when the business has none", () => {
    render(<AppShell business={buildBusiness({})} searchRows={[]}><CalendarPage /></AppShell>);
    expect(screen.queryByRole("button", { name: "Copy link" })).toBeNull();
    expect(document.querySelector(".fd-cbk")?.textContent).not.toContain("/book");
  });
});

describe("the day summary with stops you added", () => {
  it("reads '1 stop, added by you' on a day with only an added stop", async () => {
    const user = userEvent.setup();
    render(page());
    await user.click(screen.getAllByRole("button", { name: "Add estimate" })[0]);
    await user.type(screen.getByLabelText("Customer name"), "Jo Sample");
    const first = document.querySelector<HTMLButtonElement>(".fd-cnew .fd-pna .fd-btn")!;
    await user.click(first);
    const title = document.querySelector(".fd-ctitle span")!.textContent;
    // Today is full, so the first free time is on a day with no sample stop (Monday).
    expect(title).toBe("1 stop, added by you");
  });
});

describe("state survives moving between pages", () => {
  function Pages() {
    const [shown, setShown] = useState(true);
    return (
      <AppShell business={business} searchRows={[]}>
        <button type="button" onClick={() => setShown((s) => !s)}>toggle page</button>
        {shown ? <CalendarPage /> : <p>other page</p>}
      </AppShell>
    );
  }

  it("keeps the week and the open stop", async () => {
    const user = userEvent.setup();
    render(<Pages />);
    await user.click(screen.getAllByRole("button", { name: "The week after" })[0]);
    expect(screen.getByText(/Nov 29 – Dec 5, 2026/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "toggle page" }));
    expect(screen.getByText("other page")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "toggle page" }));
    expect(screen.getByText(/Nov 29 – Dec 5, 2026/)).toBeInTheDocument();
  });
});

describe("?row= from search", () => {
  const lindaId = MOCK_STOPS.find((s) => s.name === "Linda Park")!.id;
  const samId = MOCK_STOPS.find((s) => s.name === "Sam Whitaker")!.id;

  it("opens the stop and focuses it, also when Calendar is already open", async () => {
    window.history.replaceState(null, "", `/calendar?row=${lindaId}`);
    const { rerender } = render(page({ row: lindaId }));
    expect(detail().className).toContain("is-on");
    expect(detail().querySelector(".fd-dn")?.textContent).toBe("Linda Park");
    expect(stopButton("Linda Park")).toHaveFocus();
    expect(stopButton("Linda Park").dataset.rowId).toBe(lindaId);

    window.history.replaceState(null, "", `/calendar?row=${samId}`);
    rerender(page({ row: samId }));
    expect(detail().querySelector(".fd-dn")?.textContent).toBe("Sam Whitaker");
    expect(stopButton("Sam Whitaker")).toHaveFocus();
  });
});

describe("dragging a stop", () => {
  it("removes its document listeners when the page closes mid-drag, and drops nothing", () => {
    const onDrop = vi.fn();
    const grid = document.createElement("div");
    const el = document.createElement("button");
    document.body.append(grid, el);
    const spy = vi.spyOn(document, "removeEventListener");
    const { result, unmount } = renderHook(() => useStopDrag({ gridRef: { current: grid }, enabled: true, onDrop }));
    Object.defineProperty(window, "innerWidth", { value: 1440, configurable: true });
    act(() => {
      result.current.onPointerDown({ button: 0, clientX: 10, clientY: 10, currentTarget: el } as never, "stop-1", 2);
    });
    document.dispatchEvent(new MouseEvent("pointermove", { clientX: 60, clientY: 60 }));
    unmount();
    const removed = spy.mock.calls.map((c) => c[0]);
    expect(removed).toContain("pointermove");
    expect(removed).toContain("pointerup");
    document.dispatchEvent(new MouseEvent("pointerup", { clientX: 60, clientY: 60 }));
    expect(onDrop).not.toHaveBeenCalled();
    expect(el.style.transform).toBe("");
    spy.mockRestore();
  });
});
