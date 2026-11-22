import { describe, expect, it } from "vitest";
import { dayAtX, dropStart, slotAtY } from "@/features/calendar";

const cols = [56, 100, 100, 100, 100, 100, 100, 100];

describe("grid pointer maths", () => {
  it("finds the day under a point and ignores the hour labels and the outside", () => {
    expect(dayAtX(10 + 56 + 5, 10, cols)).toBe(0);
    expect(dayAtX(10 + 56 + 100, 10, cols)).toBe(1);
    expect(dayAtX(10 + 56 + 699, 10, cols)).toBe(6);
    expect(dayAtX(10 + 20, 10, cols)).toBe(-1);
    expect(dayAtX(10 + 56 + 700, 10, cols)).toBe(-1);
  });

  it("finds the half hour row and clamps it inside the grid", () => {
    expect(slotAtY(100, 100, 26)).toBe(0);
    expect(slotAtY(100 + 52, 100, 26)).toBe(2);
    expect(slotAtY(0, 100, 26)).toBe(0);
    expect(slotAtY(100 + 26 * 40, 100, 26)).toBe(21);
  });

  it("snaps a dropped stop to a row and keeps it inside the grid", () => {
    expect(dropStart(100 + 52, 100, 26, 2)).toBe(2);
    expect(dropStart(100 + 60, 100, 26, 2)).toBe(2);
    expect(dropStart(100 - 80, 100, 26, 2)).toBe(0);
    expect(dropStart(100 + 26 * 30, 100, 26, 4)).toBe(18);
  });
});
