// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { GestureLayer } from "@/features/app-shell";
import { LeadRow } from "../../../src/features/leads/components/LeadRow";
import { AddedLeadRow } from "../../../src/features/leads/components/AddedLeadRow";
import { MOCK_LEADS, liveSearchRows, searchRows } from "@/features/leads";

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
  it("reads source · need · when", () => {
    expect(searchRows[0].sub).toBe("Call · Roof leak repair · 14 min");
    expect(searchRows[3].sub).toBe("Web form · Roof replacement · 2 hrs");
  });
  it("keeps the added row's words", () => {
    expect(liveSearchRows([{ id: "n1", name: "Pat Test", sub: "Roof" }])[0].sub).toBe("Added by you · Roof");
  });
});
