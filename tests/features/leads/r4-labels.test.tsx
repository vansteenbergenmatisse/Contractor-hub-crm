// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  usePathname: () => "/leads",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(""),
}));
// Shell stub: the action bar renders inline so the test can see it.
vi.mock("@/features/app-shell", async (original) => {
  const real = await original<typeof import("@/features/app-shell")>();
  return {
    ...real,
    PageAction: ({ children }: { children: React.ReactNode }) => <div data-testid="action">{children}</div>,
    usePushed: () => {},
    useBusiness: () => real.buildBusiness({}),
    useSearchRows: () => {},
  };
});

import { GestureLayer } from "@/features/app-shell";
import { LeadRow } from "../../../src/features/leads/components/LeadRow";
import { AddedLeadRow } from "../../../src/features/leads/components/AddedLeadRow";
import { AddLeadPanel } from "../../../src/features/leads/components/AddLeadPanel";
import { LeadsStatus } from "../../../src/features/leads/components/LeadsStatus";
import { LeadsPage, leadSearchRows, liveSearchRows, type Lead, type LeadsResult } from "@/features/leads";
import { MOCK_LEADS } from "../../../src/features/leads/mock";

afterEach(cleanup);
const noop = vi.fn();
const lead = (i: number) => MOCK_LEADS[i];
const openMenu = (row: Element) => {
  fireEvent.keyDown(row, { key: "F10", shiftKey: true });
  return within(screen.getByRole("menu")).getAllByRole("menuitem").map((b) => b.textContent);
};

describe("lead row menu words", () => {
  it("says Call, as the design's button does", () => {
    const { container } = render(<GestureLayer><LeadRow lead={lead(0)} status="call" main onCall={noop} onReply={noop} onBook={noop} /></GestureLayer>);
    expect(openMenu(container.querySelector(".fd-rw")!)).toEqual(["Call", "Book visit"]);
  });
  it("says Reply on a reply row", () => {
    const { container } = render(<GestureLayer><LeadRow lead={lead(1)} status="reply" main={false} onCall={noop} onReply={noop} onBook={noop} /></GestureLayer>);
    expect(openMenu(container.querySelector(".fd-rw")!)).toEqual(["Reply", "Book visit"]);
  });
});

describe("a hand-added lead row", () => {
  it("follows a swipe, with no action to run", () => {
    const { container } = render(<GestureLayer><AddedLeadRow lead={{ id: "n1", name: "Pat Test", sub: "Roof" }} /></GestureLayer>);
    const row = container.querySelector<HTMLElement>(".fd-rw")!;
    fireEvent.touchStart(row, { touches: [{ clientX: 100, clientY: 100 }] });
    fireEvent.touchMove(row, { touches: [{ clientX: 180, clientY: 100 }] });
    expect(row.style.transform).toContain("translateX");
    fireEvent.touchEnd(row, { touches: [], changedTouches: [{ clientX: 180, clientY: 100 }] });
    expect(row.style.transform).toBe("");
  });
});

describe("leads search subtitle", () => {
  it("reads source · need · address · when", () => {
    const searchRows = leadSearchRows(MOCK_LEADS);
    expect(searchRows[0].sub).toBe("Call · Roof leak repair · 142 Weber Rd, Columbus · 14 min");
    expect(searchRows[3].sub).toBe("Web form · Roof replacement · 530 Riverside Dr, Columbus · 2 hrs");
  });
  it("keeps the added row's words", () => {
    expect(liveSearchRows([{ id: "n1", name: "Pat Test", sub: "Roof" }])[0].sub).toBe("Added by you · Roof");
  });
});

const LOADED_AT = "2026-03-04T12:00:00.000Z";
const realLead = (over: Partial<Lead> = {}): Lead => ({ id: "c1", name: "Pat Test", source: "fb", need: "", minutesWaiting: 0, receivedAt: "2026-03-04T10:00:00.000Z", address: "1 Test St", status: "new", ...over });
const ready = (leads: Lead[]): LeadsResult => ({ state: "ready", leads, loadedAt: LOADED_AT, complete: true, dropped: 0 });
const NOT_YET = "Calling and booking from this list are not available yet.";

describe("the add a lead form", () => {
  const panel = (sheet: boolean, onSubmit = vi.fn()) => {
    render(<AddLeadPanel sheet={sheet} phone={sheet} focusTick={0} form={{ name: "", phone: "", email: "", addr: "", need: "" }} errors={{ name: "", phone: "", email: "" }} focus={null} onField={noop} onSubmit={onSubmit} onClose={noop} />);
    return onSubmit;
  };
  it("submits from the keyboard's Go key, once, without a page load", () => {
    const onSubmit = panel(false);
    const form = screen.getByLabelText("Name").closest("form")!;
    expect(form.noValidate).toBe(true);
    expect(fireEvent.submit(form)).toBe(false);
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
  it("has one submit button, and Cancel does not submit", () => {
    const onSubmit = panel(false);
    expect(screen.getByRole("button", { name: "Add lead" })).toHaveAttribute("type", "submit");
    const cancel = screen.getByRole("button", { name: "Cancel" });
    expect(cancel).toHaveAttribute("type", "button");
    fireEvent.click(cancel);
    expect(onSubmit).not.toHaveBeenCalled();
  });
  it("capitalizes names and streets, and the last field says done", () => {
    panel(false);
    expect(screen.getByLabelText("Name")).toHaveAttribute("autocapitalize", "words");
    expect(screen.getByLabelText("Address (optional)")).toHaveAttribute("autocapitalize", "words");
    expect(screen.getByLabelText("What they need (optional)")).toHaveAttribute("enterkeyhint", "done");
  });
  it("fills the button only in the phone sheet", () => {
    panel(true);
    expect(screen.getByRole("button", { name: "Add lead" })).toHaveClass("is-fill");
    cleanup();
    panel(false);
    expect(screen.getByRole("button", { name: "Add lead" })).not.toHaveClass("is-fill");
  });
});

describe("the leads list", () => {
  it("says once why the buttons are off on real contacts, and keeps them off", () => {
    render(<LeadsPage result={ready([realLead(), realLead({ id: "c2", name: "Sam Test" })])} />);
    expect(screen.getAllByText(NOT_YET)).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Call Pat Test" })).toBeDisabled();
    expect(screen.getByText(NOT_YET).nextElementSibling).toHaveClass("fd-lst");
  });
  it("does not say so when every row has working buttons", () => {
    render(<LeadsPage result={ready([realLead({ status: "call", minutesWaiting: 14 })])} />);
    expect(screen.queryByText(NOT_YET)).toBeNull();
  });
  it("draws no empty card when a filter hides every row", () => {
    const { container } = render(<LeadsPage result={ready([realLead({ status: "call", minutesWaiting: 14 })])} />);
    expect(container.querySelector(".fd-lst")).not.toBeNull();
    fireEvent.click(screen.getByRole("radio", { name: /24\+/ }));
    expect(screen.getByText("Nobody waits this long.")).toBeInTheDocument();
    expect(container.querySelector(".fd-lst")).toBeNull();
  });
  it("the action bar says Finish lead while the form holds typed details, and Add a lead after", () => {
    render(<LeadsPage result={ready([realLead()])} />);
    const action = () => within(screen.getByTestId("action")).getByRole("button");
    expect(action()).toHaveTextContent("Add a lead");
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "   " } });
    expect(action()).toHaveTextContent("Add a lead");
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Lee Test" } });
    expect(action()).toHaveTextContent("Finish lead");
    fireEvent.change(screen.getByLabelText("Phone"), { target: { value: "6145550100" } });
    fireEvent.click(screen.getByRole("button", { name: "Add lead" }));
    expect(action()).toHaveTextContent("Add a lead");
  });
  it("a hand-added row says it is not saved", () => {
    render(<GestureLayer><AddedLeadRow lead={{ id: "n1", name: "Pat Test", sub: "Roof" }} /></GestureLayer>);
    expect(screen.getByText("Added by you, not saved")).toBeInTheDocument();
  });
});

describe("the leads status states", () => {
  it.each([["reconnect", true], ["unavailable", true], ["empty", false]] as const)("%s: failure look is %s", (state, bad) => {
    const { container } = render(<LeadsStatus state={state} />);
    expect(container.querySelector(".fd-none")!.classList.contains("is-bad")).toBe(bad);
  });
});
