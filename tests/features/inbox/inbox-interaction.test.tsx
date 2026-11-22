// @vitest-environment happy-dom
import { useState } from "react";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { setInboxCount, current } = vi.hoisted(() => ({ setInboxCount: vi.fn(), current: { business: null as unknown } }));
vi.mock("@/features/app-shell", async (orig) => {
  const real = await orig<typeof import("@/features/app-shell")>();
  return {
    ...real,
    useShell: () => ({ setInboxCount }),
    usePushed: vi.fn(),
    useBusiness: () => current.business as import("@/features/app-shell").Business,
    useBusinessValues: () => real.businessValues(current.business as import("@/features/app-shell").Business),
  };
});

import { buildBusiness } from "@/features/app-shell";
import { PageStateProvider } from "@/features/app-shell";
import { InboxPage } from "@/features/inbox";

// Made-up business.
current.business = buildBusiness({ name: "Test Roofing Co", owner: "Sam Tester", websiteUrl: "https://www.test-roofing.example" });

const ix = () => document.querySelector(".fd-ix") as HTMLElement;
const row = (name: string) => screen.getAllByRole("button").find((b) => b.classList.contains("fd-cr") && b.textContent?.includes(name)) as HTMLElement;
const thread = () => document.querySelector(".fd-tm") as HTMLElement;
const heading = () => document.querySelector(".fd-thn")?.textContent;
const composer = () => document.getElementById("fd-reply") as HTMLInputElement;

function setWidth(w: number) {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: w });
}

beforeEach(() => {
  setInboxCount.mockClear();
  setWidth(1280);
});
afterEach(() => setWidth(1280));

describe("Inbox: Escape on a phone", () => {
  it("closes the open conversation and returns focus to its row", async () => {
    setWidth(390);
    const user = userEvent.setup();
    render(<InboxPage />);
    await user.click(row("Jordan Reyes"));
    expect(ix()).toHaveClass("is-open");
    await user.keyboard("{Escape}");
    expect(ix()).not.toHaveClass("is-open");
    expect(row("Jordan Reyes")).toHaveFocus();
  });

  it("does nothing on a computer, where the list and the thread show side by side", async () => {
    const user = userEvent.setup();
    render(<InboxPage />);
    await user.click(row("Jordan Reyes"));
    await user.keyboard("{Escape}");
    expect(ix()).toHaveClass("is-open");
  });

  it("leaves Escape to an open dialog first", async () => {
    setWidth(390);
    const user = userEvent.setup();
    render(
      <>
        <InboxPage />
        <div role="dialog" aria-modal="true">sheet</div>
      </>,
    );
    await user.click(row("Jordan Reyes"));
    await user.keyboard("{Escape}");
    expect(ix()).toHaveClass("is-open");
  });
});

describe("Inbox: thread scrolling", () => {
  it("Mark done does not scroll the thread to the end; opening and sending do", async () => {
    const user = userEvent.setup();
    render(<InboxPage />);
    const sets: number[] = [];
    let top = 0;
    Object.defineProperty(thread(), "scrollHeight", { configurable: true, get: () => 900 });
    Object.defineProperty(thread(), "scrollTop", { configurable: true, get: () => top, set: (v: number) => { top = v; sets.push(v); } });
    await user.click(row("Jordan Reyes"));
    expect(sets.at(-1)).toBe(900);
    top = 100;
    sets.length = 0;
    await user.click(screen.getByRole("button", { name: "Mark done" }));
    expect(screen.getByRole("button", { name: "Flag for reply" })).toBeInTheDocument();
    expect(sets).toEqual([]);
    expect(top).toBe(100);
    await user.type(composer(), "On my way");
    await user.click(screen.getByRole("button", { name: "Send" }));
    expect(sets.at(-1)).toBe(900);
  });
});

describe("Inbox: keyboard", () => {
  it("opening a conversation with the keyboard moves focus to the reply box", async () => {
    const user = userEvent.setup();
    render(<InboxPage />);
    row("Nina Castillo").focus();
    await user.keyboard("{Enter}");
    expect(heading()).toBe("Nina Castillo");
    expect(composer()).toHaveFocus();
  });

  it("the summary button opens the longest wait and puts focus in the reply box", async () => {
    const user = userEvent.setup();
    render(<InboxPage />);
    screen.getByRole("button", { name: "Reply to Nina" }).focus();
    await user.keyboard("{Enter}");
    expect(heading()).toBe("Nina Castillo");
    expect(composer()).toHaveFocus();
  });
});

describe("Inbox: badge and kept state", () => {
  it("a reply clears the wait, shows 'You:' on the row and drops the badge", async () => {
    const user = userEvent.setup();
    render(<InboxPage />);
    expect(setInboxCount).toHaveBeenLastCalledWith(3);
    await user.click(row("Jordan Reyes"));
    await user.type(composer(), "Saturday at 10 works{Enter}");
    expect(row("Jordan Reyes")).toHaveTextContent("You: Saturday at 10 works");
    expect(setInboxCount).toHaveBeenLastCalledWith(2);
  });

  it("keeps the reply and the badge after moving to another page and back", async () => {
    function Pages() {
      const [on, setOn] = useState(true);
      return (
        <PageStateProvider>
          <button type="button" onClick={() => setOn((v) => !v)}>switch page</button>
          {on ? <InboxPage /> : <p>other page</p>}
        </PageStateProvider>
      );
    }
    const user = userEvent.setup();
    render(<Pages />);
    await user.click(row("Jordan Reyes"));
    await user.type(composer(), "Saturday at 10 works{Enter}");
    await user.click(screen.getByRole("button", { name: "switch page" }));
    expect(screen.getByText("other page")).toBeInTheDocument();
    setInboxCount.mockClear();
    await user.click(screen.getByRole("button", { name: "switch page" }));
    expect(row("Jordan Reyes")).toHaveTextContent("You: Saturday at 10 works");
    expect(setInboxCount).toHaveBeenLastCalledWith(2);
    expect(heading()).toBe("Jordan Reyes");
  });
});

describe("Inbox: a search result (?row=)", () => {
  it("puts the search row id on each conversation row", () => {
    render(<InboxPage />);
    expect(row("Nina Castillo")).toHaveAttribute("data-row-id", "inbox-c3");
  });

  it("opens the conversation the result points at", () => {
    render(<InboxPage row="inbox-c3" />);
    expect(ix()).toHaveClass("is-open");
    expect(heading()).toBe("Nina Castillo");
    expect(row("Nina Castillo")).toHaveAttribute("aria-current", "true");
  });

  it("opens another conversation when a new result arrives while the Inbox is open, showing everyone if a filter hid it", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<InboxPage row="inbox-c1" />);
    expect(heading()).toBe("Maria Alvarez");
    await user.click(screen.getByRole("radio", { name: /Under 1 Hr/ }));
    expect(row("Nina Castillo")).toHaveClass("is-off");
    act(() => rerender(<InboxPage row="inbox-c3" />));
    expect(heading()).toBe("Nina Castillo");
    expect(row("Nina Castillo")).not.toHaveClass("is-off");
    expect(screen.getByRole("radio", { name: /All/ })).toHaveAttribute("aria-checked", "true");
  });

  it("ignores an id that is not a conversation", () => {
    render(<InboxPage row="quote-q3" />);
    expect(ix()).not.toHaveClass("is-open");
    expect(heading()).toBe("Maria Alvarez");
  });
});
