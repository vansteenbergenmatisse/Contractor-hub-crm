// @vitest-environment happy-dom
import { useState } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { setInboxCount, current, kept, searchRows } = vi.hoisted(() => ({ setInboxCount: vi.fn(), current: { business: null as unknown }, kept: { keys: new Set<string>() }, searchRows: vi.fn() }));
vi.mock("@/features/app-shell", async (orig) => {
  const real = await orig<typeof import("@/features/app-shell")>();
  return {
    ...real,
    useShell: () => ({ setInboxCount }),
    usePushed: vi.fn(),
    useBusiness: () => current.business as import("@/features/app-shell").Business,
    useBusinessValues: () => real.businessValues(current.business as import("@/features/app-shell").Business),
    useSearchRows: searchRows,
    useKeptReducer: ((...args: Parameters<typeof real.useKeptReducer>) => {
      kept.keys.add(args[0]);
      return real.useKeptReducer(...args);
    }) as typeof real.useKeptReducer,
  };
});

import { GestureLayer, PageStateProvider, ROW_PICK_EVENT, buildBusiness } from "@/features/app-shell";
import { InboxPage } from "@/features/inbox";

// Made-up business.
current.business = buildBusiness({ name: "Test Roofing Co", owner: "Sam Tester", websiteUrl: "https://www.test-roofing.example" });

const ix = () => document.querySelector(".fd-ix") as HTMLElement;
const row = (name: string) => Array.from(document.querySelectorAll<HTMLElement>(".fd-cr")).find((b) => b.textContent?.includes(name)) as HTMLElement;
const heading = () => document.querySelector(".fd-thn")?.textContent;
const composer = () => document.getElementById("fd-reply") as HTMLInputElement;
const sentShown = () => Array.from(document.querySelectorAll(".fd-tcv .fd-m.is-out .fd-mb")).map((p) => p.textContent);
const setWidth = (w: number) => Object.defineProperty(window, "innerWidth", { configurable: true, writable: true, value: w });

beforeEach(() => {
  setInboxCount.mockClear();
  kept.keys.clear();
  setWidth(1280);
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => setWidth(1280));

function Pages() {
  const [on, setOn] = useState(true);
  return (
    <PageStateProvider>
      <button type="button" onClick={() => setOn((v) => !v)}>switch page</button>
      {on ? <InboxPage /> : <p>other page</p>}
    </PageStateProvider>
  );
}

describe("Inbox: kept state", () => {
  it("keeps its state under its own key, 'inbox'", () => {
    render(<InboxPage />);
    expect(kept.keys).toEqual(new Set(["inbox"]));
  });

  it("keeps a half-written reply after moving to another page and back", async () => {
    const user = userEvent.setup();
    render(<Pages />);
    await user.click(row("Jordan Reyes"));
    await user.type(composer(), "Saturday at");
    await user.click(screen.getByRole("button", { name: "switch page" }));
    expect(screen.getByText("other page")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "switch page" }));
    expect(heading()).toBe("Jordan Reyes");
    expect(composer()).toHaveValue("Saturday at");
  });

  it("empties the reply box when another conversation opens, as the design does", async () => {
    const user = userEvent.setup();
    render(<InboxPage />);
    await user.click(row("Jordan Reyes"));
    await user.type(composer(), "Saturday at");
    await user.click(row("Jordan Reyes"));
    expect(composer()).toHaveValue("Saturday at");
    await user.click(row("Nina Castillo"));
    expect(composer()).toHaveValue("");
  });
});

describe("Inbox: live search rows", () => {
  it("hands the shell its rows as they show now, with the owner's reply and the business facts", async () => {
    const user = userEvent.setup();
    render(<InboxPage />);
    const last = () => searchRows.mock.calls.at(-1) as [string, { name: string; sub: string }[]];
    expect(last()[0]).toBe("inbox");
    expect(last()[1].find((r) => r.name === "Ellen Novak")?.sub).toBe("Web form · System: Hi Ellen, thanks for your request. We got it. Sam calls you soon.");
    await user.click(row("Jordan Reyes"));
    await user.type(composer(), "Saturday works");
    await user.click(screen.getByRole("button", { name: "Send" }));
    expect(last()[1].find((r) => r.name === "Jordan Reyes")?.sub).toBe("Text · You: Saturday works");
  });
});

describe("Inbox: composer", () => {
  it("Enter in the reply box does not send; only Send does (design)", async () => {
    const user = userEvent.setup();
    render(<InboxPage />);
    await user.click(row("Jordan Reyes"));
    await user.type(composer(), "Saturday at 10 works{Enter}");
    expect(row("Jordan Reyes")).not.toHaveTextContent("You:");
    expect(composer()).toHaveValue("Saturday at 10 works");
    await user.click(screen.getByRole("button", { name: "Send" }));
    expect(row("Jordan Reyes")).toHaveTextContent("You: Saturday at 10 works");
    expect(composer()).toHaveValue("");
  });

  it("shows only the newest 4 of the owner's messages in the thread", async () => {
    const user = userEvent.setup();
    render(<InboxPage />);
    await user.click(row("Jordan Reyes"));
    for (const text of ["one", "two", "three", "four", "five"]) {
      await user.type(composer(), text);
      await user.click(screen.getByRole("button", { name: "Send" }));
    }
    expect(sentShown()).toEqual(["two", "three", "four", "five"]);
    expect(document.querySelectorAll(".fd-tcv .fd-m.is-out.is-new-a, .fd-tcv .fd-m.is-out.is-new-b")).toHaveLength(1);
    expect(row("Jordan Reyes")).toHaveTextContent("You: five");
  });
});

describe("Inbox: Call in the thread header", () => {
  it("shows Call on every conversation, as the design does; it dials when there is a number", async () => {
    const user = userEvent.setup();
    render(<InboxPage />);
    for (const name of ["Dana Kim", "Bright Daycare", "Hannah Brooks", "Harlan Realty"]) {
      await user.click(row(name));
      const call = document.querySelector(".fd-thh .fd-tha .fd-tcall") as HTMLElement;
      expect(call, name).not.toBeNull();
      expect(call).toHaveTextContent("Call");
      expect(call).toHaveAccessibleName(`Call ${name}`);
    }
    await user.click(row("Jordan Reyes"));
    expect(document.querySelector(".fd-tcall")).toHaveAttribute("href", "tel:6145550178");
  });
});

describe("Inbox: picking the same search result again", () => {
  it("reopens the conversation after going back to the list, and shows everyone if a filter hid it", async () => {
    setWidth(390);
    const user = userEvent.setup();
    render(<InboxPage row="inbox-c3" />);
    expect(ix()).toHaveClass("is-open");
    await user.click(screen.getByRole("button", { name: "Inbox" }));
    expect(ix()).not.toHaveClass("is-open");
    await user.click(screen.getByRole("radio", { name: /Under 1 Hr/ }));
    expect(row("Nina Castillo")).toHaveClass("is-off");
    act(() => {
      window.dispatchEvent(new CustomEvent(ROW_PICK_EVENT, { detail: "inbox-c3" }));
    });
    expect(ix()).toHaveClass("is-open");
    expect(heading()).toBe("Nina Castillo");
    expect(row("Nina Castillo")).not.toHaveClass("is-off");
  });

  it("ignores a pick of another row (that one arrives through ?row=)", async () => {
    setWidth(390);
    const user = userEvent.setup();
    render(<InboxPage row="inbox-c3" />);
    await user.click(screen.getByRole("button", { name: "Inbox" }));
    act(() => {
      window.dispatchEvent(new CustomEvent(ROW_PICK_EVENT, { detail: "inbox-c1" }));
    });
    expect(ix()).not.toHaveClass("is-open");
  });
});

describe("Inbox: row gestures (design uxActs / uxItems)", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });
  afterEach(() => vi.useRealTimers());

  const renderWithLayer = () => render(<GestureLayer><InboxPage /></GestureLayer>);
  const rect = (el: HTMLElement) => {
    el.getBoundingClientRect = () => ({ left: 0, top: 100, width: 390, height: 60, right: 390, bottom: 160, x: 0, y: 100, toJSON: () => ({}) }) as DOMRect;
  };
  const touch = (el: Element, type: "touchStart" | "touchMove" | "touchEnd", x: number, y: number) => {
    const list = [{ clientX: x, clientY: y }];
    act(() => {
      fireEvent[type](el, type === "touchEnd" ? { touches: [], changedTouches: list } : { touches: list, changedTouches: list });
    });
  };
  const drag = (el: Element, from: number, to: number) => {
    touch(el, "touchStart", from, 120);
    touch(el, "touchMove", (from + to) / 2, 120);
    touch(el, "touchMove", to, 120);
    touch(el, "touchEnd", to, 120);
  };

  it("the menu has Open conversation, then Mark done or Flag for reply", async () => {
    renderWithLayer();
    fireEvent.contextMenu(row("Maria Alvarez"), { clientX: 100, clientY: 120 });
    expect(screen.getByRole("menu", { name: "Actions for Maria Alvarez" })).toBeInTheDocument();
    expect(screen.getAllByRole("menuitem").map((i) => i.textContent)).toEqual(["Open conversation", "Mark done"]);
    fireEvent.click(screen.getByRole("menuitem", { name: "Mark done" }));
    await act(async () => { vi.advanceTimersByTime(10); });
    expect(row("Maria Alvarez")).not.toHaveClass("is-need");
    fireEvent.contextMenu(row("Maria Alvarez"), { clientX: 100, clientY: 120 });
    expect(screen.getAllByRole("menuitem").map((i) => i.textContent)).toEqual(["Open conversation", "Flag for reply"]);
  });

  it("Open conversation from the menu opens that row", async () => {
    renderWithLayer();
    fireEvent.contextMenu(row("Dana Kim"), { clientX: 100, clientY: 120 });
    fireEvent.click(screen.getByRole("menuitem", { name: "Open conversation" }));
    await act(async () => { vi.advanceTimersByTime(10); });
    expect(heading()).toBe("Dana Kim");
    expect(ix()).toHaveClass("is-open");
  });

  it("the swipe-right strip says Reply (design), while the menu keeps Open conversation", () => {
    setWidth(390);
    renderWithLayer();
    const dana = row("Dana Kim");
    rect(dana);
    touch(dana, "touchStart", 60, 120);
    touch(dana, "touchMove", 160, 120);
    touch(dana, "touchMove", 260, 120);
    expect(document.querySelector(".fx-swipe .fx-swl")).toHaveTextContent("Reply");
    touch(dana, "touchEnd", 260, 120);
    expect(heading()).toBe("Dana Kim");
  });

  it("swipe right opens the conversation; swipe left marks that row done without opening it", () => {
    setWidth(390);
    renderWithLayer();
    const nina = row("Nina Castillo");
    rect(nina);
    drag(nina, 300, 120);
    expect(row("Nina Castillo")).not.toHaveClass("is-need");
    expect(ix()).not.toHaveClass("is-open");
    const dana = row("Dana Kim");
    rect(dana);
    drag(dana, 60, 260);
    expect(heading()).toBe("Dana Kim");
    expect(ix()).toHaveClass("is-open");
  });
});
