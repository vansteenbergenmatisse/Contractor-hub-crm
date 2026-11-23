import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { createInitialState, sourceCounts, tiles, weekKnown, type Lead, type LeadsResult } from "@/features/leads";
import { LeadsCard } from "@/features/today";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

// All values are fake. 2026-03-04 is a Wednesday, so the calendar week began on Sunday 2026-03-01.
const LOADED_AT = "2026-03-04T12:00:00.000Z";
const lead = (id: string, receivedAt: string, source: Lead["source"] = null): Lead => ({
  id, name: id, source, need: "", minutesWaiting: 0, address: "", status: "new", receivedAt,
});
const week = (rows: Lead[], timeZone = "UTC", complete = true, loadedAt = LOADED_AT) =>
  tiles(rows, createInitialState(rows), { loadedAt, complete, timeZone }).week;
const ready = (rows: Lead[]): Extract<LeadsResult, { state: "ready" }> => ({ state: "ready", leads: rows, loadedAt: LOADED_AT, complete: true, dropped: 0 });

describe("L7: this week is the calendar week in the HighLevel zone", () => {
  it("leaves out a lead from last Saturday, inside the old rolling 7 days", () => {
    expect(week([lead("sat", "2026-02-28T12:00:00.000Z"), lead("sun", "2026-03-01T00:00:00.000Z")])).toBe(1);
  });

  it("starts the week at Sunday midnight in the client's zone", () => {
    // 03:00 UTC on Sunday is still Saturday evening in New York.
    const rows = [lead("edge", "2026-03-01T03:00:00.000Z")];
    expect(week(rows, "UTC")).toBe(1);
    expect(week(rows, "America/New_York")).toBe(0);
  });

  it("does not count a date after the load", () => {
    expect(week([lead("later", "2026-03-05T12:00:00.000Z")])).toBe(0);
  });

  it("on a partial page, needs a row from before the week began", () => {
    expect(week([lead("a", "2026-03-02T12:00:00.000Z"), lead("b", "2026-03-01T12:00:00.000Z")], "UTC", false)).toBeNull();
    expect(week([lead("a", "2026-03-02T12:00:00.000Z"), lead("b", "2026-02-28T12:00:00.000Z")], "UTC", false)).toBe(1);
  });

  it("claims no count for an unknown zone", () => {
    expect(weekKnown([lead("a", "2026-03-02T12:00:00.000Z")], LOADED_AT, true, 0, "Not/AZone")).toBe(false);
  });

  it("the sources panel and the Today week pane use the same week", () => {
    const rows = [lead("Inside Person", "2026-03-02T12:00:00.000Z", "fb"), lead("Outside Person", "2026-02-28T12:00:00.000Z", "fb")];
    expect(sourceCounts(rows, LOADED_AT, "UTC")).toMatchObject({ total: 1 });
    const pane = renderToStaticMarkup(createElement(LeadsCard, { result: ready(rows), range: "week", onRange: () => {}, timeZone: "UTC" }));
    expect(pane).toContain("Inside Person");
    expect(pane).not.toContain("Outside Person");
  });
});
