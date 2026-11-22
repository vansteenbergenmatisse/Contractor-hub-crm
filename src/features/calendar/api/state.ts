import type { CalendarAction, CalendarState, Placement, Stop } from "../types";
import { fromDayIndex, toDayIndex } from "./dates";
import { NEW_LEN } from "./free-times";

// The page's state as pure functions, so every transition can be tested without a browser.
// Phase 2: nothing here sends or stores anything. A move or a delete only changes this state.

export function initialState(stops: readonly Stop[], now: Date): CalendarState {
  return {
    stops: stops.map((s) => ({ ...s })),
    wk: 0, sd: now.getDay(), view: "week", selId: null, picking: false,
    moved: {}, lastMove: null, deleted: {}, lastDelete: null, confirmId: null,
    add: null, addName: "", addError: "", linkCopied: false,
    bumps: 0, sw: 0, ev: "", fresh: true, nextAdded: 1,
  };
}

export const ADD_NAME_ERROR = "Enter the customer name.";

export const findStop = (state: CalendarState, id: string | null): Stop | undefined => (id === null ? undefined : state.stops.find((s) => s.id === id));

// Where a stop is now: moved, or where it started.
export function placementOf(state: CalendarState, stop: Stop): Placement {
  return state.moved[stop.id] ?? { week: stop.week, day: stop.day, start: stop.start };
}

// Stops that are still on the calendar (not deleted), with their current place.
export const liveStops = (state: CalendarState): Array<Stop & { place: Placement }> =>
  state.stops.filter((s) => !state.deleted[s.id]).map((s) => ({ ...s, place: placementOf(state, s) }));

export const isMoved = (state: CalendarState, id: string): boolean => !!state.moved[id];

const go = (s: CalendarState, o: Partial<CalendarState>): CalendarState => ({ ...s, fresh: false, ...o });

function nav(s: CalendarState, wk: number, sd: number): CalendarState {
  if (wk === s.wk && sd === s.sd) return s;
  return go(s, { wk, sd, selId: null, picking: false, confirmId: null, sw: s.sw + 1, ev: "nav" });
}

export function calendarReducer(s: CalendarState, a: CalendarAction): CalendarState {
  switch (a.type) {
    case "nav":
      return nav(s, a.wk, a.sd);
    case "step": {
      if (s.view === "week") return nav(s, s.wk + a.n, s.sd);
      const next = fromDayIndex(toDayIndex(s.wk, s.sd) + a.n);
      return nav(s, next.wk, next.sd);
    }
    case "today":
      return nav(s, 0, a.day);
    case "setView":
      if (s.view === a.view) return s;
      return go(s, { view: a.view, picking: false, sw: s.sw + 1, ev: "view" });
    case "selectDay":
      if (s.sd === a.day && s.view === "day") return s;
      return go(s, { sd: a.day, view: "day", selId: null, picking: false, sw: s.sw + 1, ev: "nav" });
    case "pick":
      return go(s, { selId: s.selId === a.id ? null : a.id, picking: false, ev: "pick" });
    case "openRow": {
      const stop = findStop(s, a.id);
      if (!stop || s.deleted[stop.id]) return s;
      const p = placementOf(s, stop);
      if (s.selId === stop.id && s.wk === p.week && s.sd === p.day) return s;
      return go(s, { selId: stop.id, wk: p.week, sd: p.day, picking: false, confirmId: null, sw: s.sw + 1, ev: "nav" });
    }
    case "closeDetail":
      return go(s, { selId: null, picking: false, ev: "pick" });
    case "openReschedule":
      return go(s, { picking: true, ev: "pick" });
    case "cancelReschedule":
      return go(s, { picking: false, ev: "pick" });
    case "move": {
      const stop = findStop(s, a.id);
      if (!stop) return s;
      if (stop.added) {
        // A stop you added moves with no undo line (the design has none for it).
        const stops = s.stops.map((x) => (x.id === a.id ? { ...x, ...a.to } : x));
        return go(s, { stops, wk: a.to.week, sd: a.to.day });
      }
      const from = placementOf(s, stop);
      const swap = a.to.week !== s.wk || (s.view === "day" && a.to.day !== s.sd);
      return go(s, {
        moved: { ...s.moved, [a.id]: a.to },
        lastMove: { id: a.id, from, had: !!s.moved[a.id] },
        picking: false, selId: a.id, wk: a.to.week, sd: a.to.day,
        bumps: s.bumps + 1, sw: s.sw + (swap ? 1 : 0), ev: "rs",
      });
    }
    case "undoMove": {
      const l = s.lastMove;
      if (!l) return s;
      const moved = { ...s.moved };
      if (l.had) moved[l.id] = l.from;
      else delete moved[l.id];
      return go(s, { moved, lastMove: null, picking: false, selId: l.id, wk: l.from.week, sd: l.from.day, bumps: s.bumps + 1, sw: s.sw + 1, ev: "rs" });
    }
    case "askDelete":
      return go(s, { confirmId: a.id });
    case "cancelDelete":
      return go(s, { confirmId: null });
    case "rescheduleInstead":
      return go(s, { confirmId: null, picking: true, ev: "pick" });
    case "confirmDelete": {
      const stop = findStop(s, s.confirmId);
      if (!stop) return s;
      return go(s, {
        deleted: { ...s.deleted, [stop.id]: true },
        lastDelete: { id: stop.id, name: stop.name, kind: stop.kind },
        selId: null, picking: false, confirmId: null,
      });
    }
    case "undoDelete": {
      const l = s.lastDelete;
      const stop = findStop(s, l?.id ?? null);
      if (!l || !stop) return s;
      const deleted = { ...s.deleted };
      delete deleted[l.id];
      const p = placementOf(s, stop);
      return go(s, { deleted, lastDelete: null, selId: l.id, wk: p.week, sd: p.day });
    }
    case "openAdd":
      return go(s, { add: { kind: a.kind, slot: a.slot ?? null }, addError: "", selId: a.slot ? null : s.selId });
    case "closeAdd":
      return go(s, { add: null, addError: "" });
    case "setAddName":
      return go(s, { addName: a.name, addError: a.name.trim() ? "" : s.addError });
    case "submitAdd": {
      if (!s.add) return s;
      const name = s.addName.trim();
      if (!name) return go(s, { addError: ADD_NAME_ERROR });
      const stop: Stop = { id: `added-${s.nextAdded}`, kind: s.add.kind, name, len: NEW_LEN[s.add.kind], added: true, ...a.placement };
      return go(s, {
        stops: [...s.stops, stop], nextAdded: s.nextAdded + 1,
        add: null, addName: "", addError: "", selId: null,
        wk: a.placement.week, sd: a.placement.day, sw: s.sw + 1, ev: "nav",
      });
    }
    case "copyLink":
      return go(s, { linkCopied: true });
    default:
      return s;
  }
}
