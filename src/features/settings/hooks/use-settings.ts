"use client";

import { useEffect, useMemo, useRef } from "react";
import { useKeptReducer, usePushed, useShell } from "@/features/app-shell";
import { extraKeys } from "../api/fields";
import { applyBrandToDocument, businessPatchFromValues, type BusinessPatch } from "../api/live-save";
import { filterSettings } from "../api/search";
import { initialState, settingsReducer, type SettingsState } from "../api/state";
import type { SectionKey } from "../types";

// The shell's `updateBusiness`; when a shell does not offer it (a page rendered alone) the call is skipped.
type ShellWithUpdate = { updateBusiness?: (patch: Partial<BusinessPatch>) => void };

// Settings state plus its side effects: the pushed detail screen on a phone, the cursor in a bad
// field after Save, scrolling to the top when a section opens, and after a good Save the new colors
// and business details for this browser session (nothing is written to HighLevel).
// The state is kept while the owner visits other pages, as in the design: unsaved edits, the open
// section and the switches are as he left them when he comes back.
export function useSettings(initial?: SettingsState, initialValues?: Record<string, string>, initialSection?: SectionKey) {
  const [state, dispatch] = useKeptReducer("settings", settingsReducer, initial, (i) => i ?? initialState(initialValues, initialSection));
  // A link such as `?section=connections` still opens its section when the state was kept.
  const sectionRef = useRef(initialSection);
  useEffect(() => {
    if (sectionRef.current && state.sec !== sectionRef.current) dispatch({ type: "go", section: sectionRef.current });
    sectionRef.current = undefined;
    // Runs once, on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // A focus request left from an earlier visit must not move the cursor on arrival.
  const arrivedFocus = useRef(state.focus);
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
    if (!state.focus || state.focus === arrivedFocus.current) return;
    document.getElementById(`cv-${state.focus.key}`)?.focus();
  }, [state.focus]);

  useEffect(() => {
    const main = document.querySelector(".fd-main");
    if (main) main.scrollTop = 0;
  }, [state.sec, state.open]);

  useEffect(() => {
    if (!state.ok) return;
    applyBrandToDocument(document, state.values);
    updateRef.current?.(businessPatchFromValues(state.values));
  }, [state.ok, state.values]);

  return { state, dispatch, filter, extras };
}
