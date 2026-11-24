import { describe, expect, it } from "vitest";
import { columnScroll } from "../../../src/features/pipeline/api/live-board";

describe("columnScroll", () => {
  const view = { scrollLeft: 0, viewWidth: 700 };
  it("stays put when the column is already in view", () => {
    expect(columnScroll({ left: 220, width: 208 }, view)).toBe(0);
  });
  it("scrolls right just enough to show a column past the edge", () => {
    expect(columnScroll({ left: 880, width: 208 }, view)).toBe(388);
  });
  it("scrolls back to a column left of the view", () => {
    expect(columnScroll({ left: 220, width: 208 }, { scrollLeft: 388, viewWidth: 700 })).toBe(220);
  });
  it("shows the start of a column wider than the view", () => {
    expect(columnScroll({ left: 300, width: 900 }, view)).toBe(300);
  });
  it("leaves a hidden column alone", () => {
    expect(columnScroll({ left: 0, width: 0 }, { scrollLeft: 120, viewWidth: 700 })).toBe(120);
  });
});
