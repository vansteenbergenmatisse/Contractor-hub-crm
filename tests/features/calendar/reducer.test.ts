import { describe, expect, it } from "vitest";
import { ADD_NAME_ERROR, calendarReducer, initialState, liveStops, MOCK_STOPS, placementOf, type CalendarAction, type CalendarState } from "@/features/calendar";

const NOW = new Date(2026, 10, 20, 10, 0); // Friday
const run = (s: CalendarState, ...actions: CalendarAction[]) => actions.reduce(calendarReducer, s);
const start = () => initialState(MOCK_STOPS, NOW);
const grace = MOCK_STOPS.find((s) => s.name === "Linda Park")!;
const place = (s: CalendarState, id: string) => placementOf(s, s.stops.find((x) => x.id === id)!);

describe("moving through weeks and days", () => {
  it("starts on this week and today, in the week view", () => {
    const s = start();
    expect(s).toMatchObject({ wk: 0, sd: 5, view: "week", selId: null, fresh: true });
  });

  it("steps whole weeks in the week view and keeps the day", () => {
    const s = run(start(), { type: "step", n: 1 }, { type: "step", n: 1 });
    expect(s).toMatchObject({ wk: 2, sd: 5, fresh: false });
    expect(run(start(), { type: "step", n: -1 }).wk).toBe(-1);
  });

  it("steps single days in the day view and rolls over the week edge both ways", () => {
    let s = run(start(), { type: "setView", view: "day" }, { type: "step", n: 1 });
    expect(s).toMatchObject({ wk: 0, sd: 6 });
    s = run(s, { type: "step", n: 1 });
    expect(s).toMatchObject({ wk: 1, sd: 0 });
    s = run(s, { type: "step", n: -1 }, { type: "step", n: -1 });
    expect(s).toMatchObject({ wk: 0, sd: 5 });
    s = run(start(), { type: "setView", view: "day" }, { type: "nav", wk: 0, sd: 0 }, { type: "step", n: -1 });
    expect(s).toMatchObject({ wk: -1, sd: 6 });
  });

  it("goes back to today, closes the open stop and does nothing when already there", () => {
    const s = start();
    expect(calendarReducer(s, { type: "today", day: 5 })).toBe(s);
    const away = run(s, { type: "pick", id: grace.id }, { type: "nav", wk: 3, sd: 1 }, { type: "today", day: 5 });
    expect(away).toMatchObject({ wk: 0, sd: 5, selId: null });
  });

  it("opens a day from the strip in the day view and ignores the same press twice", () => {
    const s = run(start(), { type: "selectDay", day: 2 });
    expect(s).toMatchObject({ sd: 2, view: "day" });
    expect(calendarReducer(s, { type: "selectDay", day: 2 })).toBe(s);
  });

  it("switches the view once", () => {
    const s = run(start(), { type: "setView", view: "day" });
    expect(s.view).toBe("day");
    expect(calendarReducer(s, { type: "setView", view: "day" })).toBe(s);
  });
});

describe("opening a stop and rescheduling", () => {
  it("toggles the open stop and closes the time picker", () => {
    let s = run(start(), { type: "pick", id: grace.id }, { type: "openReschedule" });
    expect(s).toMatchObject({ selId: grace.id, picking: true });
    s = run(s, { type: "pick", id: grace.id });
    expect(s).toMatchObject({ selId: null, picking: false });
  });

  it("moves a stop, follows it to the new week, and records a way back", () => {
    const to = { week: 1, day: 6, start: 4 };
    const s = run(start(), { type: "pick", id: grace.id }, { type: "openReschedule" }, { type: "move", id: grace.id, to });
    expect(place(s, grace.id)).toEqual(to);
    expect(s).toMatchObject({ wk: 1, sd: 6, picking: false, selId: grace.id, ev: "rs", bumps: 1 });
    expect(s.lastMove).toEqual({ id: grace.id, from: { week: 0, day: 5, start: 8 }, had: false });
  });

  it("undo puts it back and returns the view to where it was", () => {
    const to = { week: 1, day: 6, start: 4 };
    const s = run(start(), { type: "move", id: grace.id, to }, { type: "undoMove" });
    expect(place(s, grace.id)).toEqual({ week: 0, day: 5, start: 8 });
    expect(s).toMatchObject({ wk: 0, sd: 5, lastMove: null, selId: grace.id, bumps: 2 });
    expect(s.moved[grace.id]).toBeUndefined();
  });

  it("undo of a second move goes back to the first move, not the start", () => {
    const one = { week: 0, day: 6, start: 4 };
    const two = { week: 1, day: 1, start: 16 };
    const s = run(start(), { type: "move", id: grace.id, to: one }, { type: "move", id: grace.id, to: two }, { type: "undoMove" });
    expect(place(s, grace.id)).toEqual(one);
  });

  it("undo does nothing when nothing moved", () => {
    const s = start();
    expect(calendarReducer(s, { type: "undoMove" })).toBe(s);
  });

  it("ignores a move of an unknown stop", () => {
    const s = start();
    expect(calendarReducer(s, { type: "move", id: "nope", to: { week: 0, day: 1, start: 1 } })).toBe(s);
  });

  it("keeps the same week when a stop is dragged inside the week", () => {
    const s = run(start(), { type: "move", id: grace.id, to: { week: 0, day: 2, start: 6 } });
    expect(s.sw).toBe(0);
    expect(s).toMatchObject({ wk: 0, sd: 2 });
  });
});

describe("delete with undo", () => {
  it("asks first, and cancel changes nothing", () => {
    const s = run(start(), { type: "pick", id: grace.id }, { type: "askDelete", id: grace.id });
    expect(s.confirmId).toBe(grace.id);
    const c = run(s, { type: "cancelDelete" });
    expect(c.confirmId).toBeNull();
    expect(liveStops(c)).toHaveLength(MOCK_STOPS.length);
  });

  it("removes the stop at once and offers undo", () => {
    const s = run(start(), { type: "pick", id: grace.id }, { type: "askDelete", id: grace.id }, { type: "confirmDelete" });
    expect(liveStops(s).some((x) => x.id === grace.id)).toBe(false);
    expect(s).toMatchObject({ selId: null, confirmId: null, lastDelete: { id: grace.id, name: "Linda Park", kind: "E" } });
  });

  it("undo brings it back where it was and opens it", () => {
    const s = run(start(), { type: "askDelete", id: grace.id }, { type: "confirmDelete" }, { type: "undoDelete" });
    expect(liveStops(s)).toHaveLength(MOCK_STOPS.length);
    expect(s).toMatchObject({ lastDelete: null, selId: grace.id, wk: 0, sd: 5 });
  });

  it("undo brings back a moved stop at its moved place", () => {
    const to = { week: 1, day: 2, start: 4 };
    const s = run(start(), { type: "move", id: grace.id, to }, { type: "askDelete", id: grace.id }, { type: "confirmDelete" }, { type: "undoDelete" });
    expect(place(s, grace.id)).toEqual(to);
    expect(s).toMatchObject({ wk: 1, sd: 2 });
  });

  it("confirm with nothing to confirm, and undo with nothing deleted, do nothing", () => {
    const s = start();
    expect(calendarReducer(s, { type: "confirmDelete" })).toBe(s);
    expect(calendarReducer(s, { type: "undoDelete" })).toBe(s);
  });

  it("Reschedule instead closes the question and opens the time picker", () => {
    const s = run(start(), { type: "pick", id: grace.id }, { type: "askDelete", id: grace.id }, { type: "rescheduleInstead" });
    expect(s).toMatchObject({ confirmId: null, picking: true, selId: grace.id });
  });
});

describe("add an estimate or a job", () => {
  it("opens with the kind, and the double-click time when given", () => {
    const slot = { week: 0, day: 3, start: 6 };
    expect(run(start(), { type: "openAdd", kind: "J" }).add).toEqual({ kind: "J", slot: null });
    expect(run(start(), { type: "openAdd", kind: "E", slot }).add).toEqual({ kind: "E", slot });
  });

  it("asks for the customer name and says so under the field", () => {
    const s = run(start(), { type: "openAdd", kind: "E" }, { type: "setAddName", name: "   " }, { type: "submitAdd", placement: { week: 0, day: 6, start: 4 } });
    expect(s.addError).toBe(ADD_NAME_ERROR);
    expect(s.add).not.toBeNull();
    expect(s.stops).toHaveLength(MOCK_STOPS.length);
    expect(run(s, { type: "setAddName", name: "A" }).addError).toBe("");
  });

  it("adds an estimate (1 hour) and an added job (6 hours), and shows the week it lands in", () => {
    const place = { week: 1, day: 3, start: 4 };
    let s = run(start(), { type: "openAdd", kind: "E" }, { type: "setAddName", name: " Jo Sample " }, { type: "submitAdd", placement: place });
    expect(s.stops.at(-1)).toMatchObject({ id: "added-1", kind: "E", name: "Jo Sample", len: 2, added: true, ...place });
    expect(s).toMatchObject({ add: null, addName: "", wk: 1, sd: 3 });
    s = run(s, { type: "openAdd", kind: "J" }, { type: "setAddName", name: "Job Person" }, { type: "submitAdd", placement: place });
    expect(s.stops.at(-1)).toMatchObject({ id: "added-2", kind: "J", len: 12 });
  });

  it("cancel closes without adding, and submit with no sheet open does nothing", () => {
    const s = run(start(), { type: "openAdd", kind: "E" }, { type: "closeAdd" });
    expect(s.add).toBeNull();
    expect(calendarReducer(s, { type: "submitAdd", placement: { week: 0, day: 1, start: 1 } })).toBe(s);
  });

  it("deletes an added stop with undo, and moves it without an undo line", () => {
    let s = run(start(), { type: "openAdd", kind: "E" }, { type: "setAddName", name: "Jo Sample" }, { type: "submitAdd", placement: { week: 0, day: 6, start: 4 } });
    s = run(s, { type: "move", id: "added-1", to: { week: 0, day: 2, start: 10 } });
    expect(place(s, "added-1")).toEqual({ week: 0, day: 2, start: 10 });
    expect(s.lastMove).toBeNull();
    s = run(s, { type: "askDelete", id: "added-1" }, { type: "confirmDelete" });
    expect(liveStops(s).some((x) => x.id === "added-1")).toBe(false);
    s = run(s, { type: "undoDelete" });
    expect(liveStops(s).some((x) => x.id === "added-1")).toBe(true);
    expect(s).toMatchObject({ wk: 0, sd: 2 });
  });
});

describe("booking link copy", () => {
  it("says Copied after the button is pressed", () => {
    expect(run(start(), { type: "copyLink" }).linkCopied).toBe(true);
  });
});
