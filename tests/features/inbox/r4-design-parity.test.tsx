// @vitest-environment happy-dom
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { current } = vi.hoisted(() => ({ current: { business: null as unknown } }));
vi.mock("@/features/app-shell", async (orig) => {
  const real = await orig<typeof import("@/features/app-shell")>();
  return {
    ...real,
    useShell: () => ({ setInboxCount: vi.fn() }),
    usePushed: vi.fn(),
    useBusiness: () => current.business as import("@/features/app-shell").Business,
    useBusinessValues: () => real.businessValues(current.business as import("@/features/app-shell").Business),
    useSearchRows: vi.fn(),
  };
});

import { ROW_PICK_EVENT, buildBusiness } from "@/features/app-shell";
import { InboxPage } from "@/features/inbox";

// Made-up business.
current.business = buildBusiness({ name: "Test Roofing Co", owner: "Sam Tester", websiteUrl: "https://www.test-roofing.example" });

const row = (name: string) => Array.from(document.querySelectorAll<HTMLElement>(".fd-cr")).find((b) => b.textContent?.includes(name)) as HTMLElement;
const heading = () => document.querySelector(".fd-thn")?.textContent;

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => {
  window.history.replaceState(null, "", "/");
  vi.useRealTimers();
});

describe("R4-10 Inbox: Call in the thread header", () => {
  it("is the design's plain Call button on every conversation, with or without a number", async () => {
    const user = userEvent.setup();
    render(<InboxPage />);
    for (const name of ["Jordan Reyes", "Maria Alvarez", "Bright Daycare", "Hannah Brooks"]) {
      await user.click(row(name));
      const call = document.querySelector(".fd-thh .fd-tha .fd-tcall") as HTMLElement;
      expect(call.tagName, name).toBe("BUTTON");
      expect(call).toHaveAttribute("type", "button");
      expect(call).toHaveAttribute("data-fx-noact", "1");
      expect(call).not.toHaveAttribute("href");
      expect(call).toHaveAccessibleName("Call");
    }
  });
});

describe("R4-10 Inbox: a search result", () => {
  it("opens the conversation without scrolling to, focusing or ringing the row", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    window.history.replaceState(null, "", "/inbox?row=inbox-c3");
    render(<InboxPage row="inbox-c3" />);
    await act(async () => { vi.advanceTimersByTime(200); });
    expect(heading()).toBe("Nina Castillo");
    expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
    expect(document.activeElement).not.toBe(row("Nina Castillo"));
    expect(document.querySelector(".fx-flash")).toBeNull();
  });

  it("does not ring the row when the same result is picked again", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    window.history.replaceState(null, "", "/inbox?row=inbox-c3");
    render(<InboxPage row="inbox-c3" />);
    act(() => {
      window.dispatchEvent(new CustomEvent(ROW_PICK_EVENT, { detail: "inbox-c3" }));
    });
    await act(async () => { vi.advanceTimersByTime(200); });
    expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
    expect(document.querySelector(".fx-flash")).toBeNull();
  });
});

describe("R4-10 Inbox: sent messages", () => {
  it("sit right after the thread block, as its siblings in the message area", async () => {
    const user = userEvent.setup();
    render(<InboxPage />);
    await user.click(row("Jordan Reyes"));
    await user.type(document.getElementById("fd-reply") as HTMLInputElement, "Saturday works");
    await user.click(screen.getByRole("button", { name: "Send" }));
    const message = Array.from(document.querySelectorAll<HTMLElement>(".fd-tm .fd-m.is-out")).find((m) => m.textContent?.includes("Saturday works")) as HTMLElement;
    expect(message.parentElement).toHaveClass("fd-tm");
    expect(message.previousElementSibling).toHaveClass("fd-tcv");
    expect(message.nextElementSibling).toHaveClass("fx-dlv");
  });
});
