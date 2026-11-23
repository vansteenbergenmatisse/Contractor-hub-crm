import { describe, expect, it } from "vitest";
import { horizontalSwipe, menuPosition, orderMenu, pullDistance, rowSwipeFrame, rowSwipeIntent, swipeActions, updatedAgo, type RowAction } from "@/features/app-shell";

const noop = () => {};

describe("row swipe numbers (design uxSwipe)", () => {
  it("follows the finger up to 80% of the row and runs past min(120px, 40%)", () => {
    expect(rowSwipeFrame(100, 390, true)).toEqual({ offset: 100, go: false });
    expect(rowSwipeFrame(121, 390, true)).toEqual({ offset: 121, go: true });
    expect(rowSwipeFrame(-400, 390, true)).toEqual({ offset: -312, go: true });
    // a narrow row: 40% of 200 is 80
    expect(rowSwipeFrame(81, 200, true).go).toBe(true);
  });
  it("gives only 28px when that side has no action, and never runs", () => {
    expect(rowSwipeFrame(200, 390, false)).toEqual({ offset: 28, go: false });
    expect(rowSwipeFrame(-200, 390, false)).toEqual({ offset: -28, go: false });
  });
  it("starts once the move is clearly sideways and gives way to a scroll", () => {
    expect(rowSwipeIntent(5, 2)).toBe("wait");
    expect(rowSwipeIntent(13, 2)).toBe("start");
    expect(rowSwipeIntent(13, 10)).toBe("wait");
    expect(rowSwipeIntent(4, 11)).toBe("cancel");
  });
  it("picks the swipe actions the page marked", () => {
    const call: RowAction = { label: "Call", onAction: noop, swipe: "right" };
    const done: RowAction = { label: "Mark done", onAction: noop, swipe: "left" };
    expect(swipeActions([done, call])).toEqual({ right: call, left: done });
    expect(swipeActions([{ label: "Open", onAction: noop }])).toEqual({ right: null, left: null });
  });
});

describe("menu", () => {
  it("puts destructive actions last", () => {
    const list = orderMenu([
      { label: "Lost", onAction: noop, tone: "danger" },
      { label: "Call", onAction: noop },
      { label: "Text", onAction: noop },
    ]);
    expect(list.map((a) => a.label)).toEqual(["Call", "Text", "Lost"]);
  });
  it("keeps the menu on screen (8px margin on a computer, 12px on a phone)", () => {
    expect(menuPosition({ x: 900, y: 700 }, { width: 240, height: 200 }, { width: 1000, height: 800 }, false)).toEqual({ left: 752, top: 592 });
    expect(menuPosition({ x: 2, y: 2 }, { width: 240, height: 200 }, { width: 390, height: 800 }, true)).toEqual({ left: 12, top: 12 });
  });
});

describe("swipes and pull", () => {
  it("counts a stage or week swipe from 70px sideways with at most 40px up or down", () => {
    expect(horizontalSwipe(-70, 0)).toBe("left");
    expect(horizontalSwipe(80, 40)).toBe("right");
    expect(horizontalSwipe(69, 0)).toBeNull();
    expect(horizontalSwipe(100, 41)).toBeNull();
  });
  it("pulls at half the finger's speed up to 96px", () => {
    expect(pullDistance(100)).toBe(50);
    expect(pullDistance(400)).toBe(96);
    expect(pullDistance(-20)).toBe(0);
  });
  it("says when the page was last updated", () => {
    expect(updatedAgo(0, 59_000)).toBe("Refreshed just now");
    expect(updatedAgo(0, 180_000)).toBe("Refreshed 3 min ago");
  });
});
