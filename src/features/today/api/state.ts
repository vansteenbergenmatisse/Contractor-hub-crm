import type { LeadRange, NeedsFilter, RowStatus, TodayAction, Todo, TodayState } from "../types";

// State of the Today page. Phase 2: it lives on screen only. Nothing here sends, saves or calls out.
export function initialState(todos: readonly Todo[]): TodayState {
  const status: Record<string, RowStatus> = {};
  for (const todo of todos) status[todo.id] = 0;
  return { status, filter: "all", range: "today", ev: "", bumps: 0 };
}

// Sets one to-do to open (0), done (1) or done the other way (2).
// Same value, unknown id, or Undo of a send (a quote or an invoice that went out) changes nothing.
export function setStatus(state: TodayState, todos: readonly Todo[], id: string, value: RowStatus): TodayState {
  const todo = todos.find((t) => t.id === id);
  if (!todo) return state;
  const current = state.status[id] ?? 0;
  if (current === value) return state;
  if (value === 0 && todo.send && current === 1) return state;
  return { ...state, status: { ...state.status, [id]: value }, ev: `row:${id}`, bumps: state.bumps + 1 };
}

export const setFilter = (state: TodayState, filter: NeedsFilter): TodayState =>
  state.filter === filter ? state : { ...state, filter, ev: "filter" };

export const setRange = (state: TodayState, range: LeadRange): TodayState =>
  state.range === range ? state : { ...state, range, ev: "seg" };

export function createReducer(todos: readonly Todo[]) {
  return (state: TodayState, action: TodayAction): TodayState => {
    switch (action.type) {
      case "set": return setStatus(state, todos, action.id, action.value);
      case "filter": return setFilter(state, action.filter);
      case "range": return setRange(state, action.range);
    }
  };
}
