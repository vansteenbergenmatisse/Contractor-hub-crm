"use client";

import { useEffect, useMemo, useReducer } from "react";
import { usePushed } from "@/features/app-shell";
import { filterSettings } from "../api/search";
import { initialState, settingsReducer, type SettingsState } from "../api/state";

// Settings state plus its three side effects: the pushed detail screen on a phone, the cursor in a
// bad field after Save, and scrolling to the top when a section opens.
export function useSettings(initial?: SettingsState) {
  const [state, dispatch] = useReducer(settingsReducer, initial, (i) => i ?? initialState());
  const filter = useMemo(() => filterSettings(state.q), [state.q]);

  usePushed(state.open && !filter.active);

  useEffect(() => {
    if (!state.focus) return;
    document.getElementById(`cv-${state.focus.key}`)?.focus();
  }, [state.focus]);

  useEffect(() => {
    const main = document.querySelector(".fd-main");
    if (main) main.scrollTop = 0;
  }, [state.sec, state.open]);

  return { state, dispatch, filter };
}
