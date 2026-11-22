"use client";

import { useEffect, useMemo, useRef } from "react";
import { useKeptReducer, usePushed, useShell } from "@/features/app-shell";
import { CONNECTIONS, SWITCHES, extraKeys } from "../api/fields";
import { connectionRowText } from "../api/connections";
import { applyBrandToDocument, businessPatchFromValues, type BusinessPatch } from "../api/live-save";
import { filterSettings } from "../api/search";
import { initialState, settingsReducer, type SettingsState } from "../api/state";
import type { ConnectionStatus, SectionKey } from "../types";

// The shell's `updateBusiness`; when a shell does not offer it (a page rendered alone) the call is skipped.
type ShellWithUpdate = { updateBusiness?: (patch: Partial<BusinessPatch>) => void };

// Settings state plus its side effects: the pushed detail screen on a phone, the cursor in a bad
// field after Save, scrolling to the top when a section opens, and after a good Save the new colors
// and business details for this browser session (nothing is written to HighLevel).
// The state is kept while the owner visits other pages, as in the design: unsaved edits, the open
// section and the switches are as he left them when he comes back.
export function useSettings(
  initial: SettingsState | undefined,
  initialValues: Record<string, string> | undefined,
  initialSection: SectionKey | undefined,
  connections: readonly ConnectionStatus[],
) {
  const [state, dispatch] = useKeptReducer("settings", settingsReducer, initial, (i) => i ?? initialState(initialValues, initialSection));
  // A link such as `?section=connections` always opens its section, as the design's `toSet` does:
  // also when the kept state already has that section (open or closed with Back), and again when the
  // link changes while the page stays mounted.
  useEffect(() => {
    if (initialSection) dispatch({ type: "go", section: initialSection });
  }, [initialSection, dispatch]);
  // A focus request left from an earlier visit must not move the cursor on arrival.
  const arrivedFocus = useRef(state.focus);
  const extras = useMemo(() => extraKeys(state.values), [state.values]);
  const phone = (state.values.business_phone_number ?? "").trim();
  // The search reads each row's whole text as it shows now (design: the row's textContent).
  const rowText = useMemo(() => {
    const out: Record<string, string> = {};
    CONNECTIONS.forEach((c, i) => {
      out[`conn-${i}`] = connectionRowText(c, {
        status: connections[i] ?? { state: "unknown" },
        phone: i === 0 ? phone : "",
        how: !!state.how[i],
        asked: !!state.asked[i],
        a2p: i === 0,
      });
    });
    SWITCHES.forEach((label, i) => {
      out[`sw-${i}`] = `${label} ${state.sw[i] ? "On" : "Off"}`;
    });
    return out;
  }, [connections, phone, state.how, state.asked, state.sw]);
  const filter = useMemo(() => filterSettings(state.q, extras, rowText), [state.q, extras, rowText]);
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

  return { state, dispatch, filter, extras, phone };
}
