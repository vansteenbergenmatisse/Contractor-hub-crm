"use client";

import { useEffect, useMemo, useReducer, useRef } from "react";
import { usePushed, useShell } from "@/features/app-shell";
import { extraKeys } from "../api/fields";
import { applyBrandVars, businessPatchFromValues, type BusinessPatch } from "../api/live-save";
import { filterSettings } from "../api/search";
import { initialState, settingsReducer, type SettingsState } from "../api/state";
import type { SectionKey } from "../types";

// `updateBusiness` is being added to the shell's API; until it exists the call is skipped.
type ShellWithUpdate = { updateBusiness?: (patch: BusinessPatch) => void };

// Settings state plus its side effects: the pushed detail screen on a phone, the cursor in a bad
// field after Save, scrolling to the top when a section opens, and after a good Save the new colors
// and business details for this browser session (nothing is written to HighLevel).
export function useSettings(initial?: SettingsState, initialValues?: Record<string, string>, initialSection?: SectionKey) {
  const [state, dispatch] = useReducer(settingsReducer, initial, (i) => i ?? initialState(initialValues, initialSection));
  const extras = useMemo(() => extraKeys(state.values), [state.values]);
  const filter = useMemo(() => filterSettings(state.q, extras), [state.q, extras]);
  const shell = useShell() as ShellWithUpdate;
  // Held in a ref so a new function identity from the shell never re-runs the Save effect (no loop).
  const updateRef = useRef(shell.updateBusiness);
  useEffect(() => {
    updateRef.current = shell.updateBusiness;
  });

  usePushed(state.open && !filter.active);

  useEffect(() => {
    if (!state.focus) return;
    document.getElementById(`cv-${state.focus.key}`)?.focus();
  }, [state.focus]);

  useEffect(() => {
    const main = document.querySelector(".fd-main");
    if (main) main.scrollTop = 0;
  }, [state.sec, state.open]);

  useEffect(() => {
    if (!state.ok) return;
    applyBrandVars(document.documentElement, state.values);
    updateRef.current?.(businessPatchFromValues(state.values));
  }, [state.ok, state.values]);

  return { state, dispatch, filter, extras };
}
