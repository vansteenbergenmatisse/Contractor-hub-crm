"use client";

import { useMemo, useReducer } from "react";
import { useShell } from "@/features/app-shell";
import { createReducer, initialState } from "../api/state";
import { nextTodo, pressPlan, sendRequest } from "../api/selectors";
import type { NeedsFilter, LeadRange, RowStatus, Todo } from "../types";

// Page state plus the presses. Everything stays on screen: no fetch, no save, no automation.
// Approve (a quote) and Yes, send invoice open the shared 20-second timer and count as done only
// when it ends. Cancel in the timer changes nothing.
export function useToday(todos: readonly Todo[]) {
  const reducer = useMemo(() => createReducer(todos), [todos]);
  const [state, dispatch] = useReducer(reducer, todos, initialState);
  const { sendTimer } = useShell();

  const press = (todo: Todo, value: RowStatus) => {
    if (pressPlan(todo, value) === "send") {
      const request = sendRequest(todo, () => dispatch({ type: "set", id: todo.id, value: 1 }));
      if (request) sendTimer(request);
      return;
    }
    dispatch({ type: "set", id: todo.id, value });
  };

  return {
    state,
    press,
    undo: (todo: Todo) => dispatch({ type: "set", id: todo.id, value: 0 }),
    pressNext: () => {
      const next = nextTodo(state, todos);
      if (next) press(next, 1);
    },
    setFilter: (filter: NeedsFilter) => dispatch({ type: "filter", filter }),
    setRange: (range: LeadRange) => dispatch({ type: "range", range }),
  };
}
