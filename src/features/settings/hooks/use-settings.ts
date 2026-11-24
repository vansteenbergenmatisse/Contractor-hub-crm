"use client";

import { useEffect, useMemo, useRef } from "react";
import { useKeptReducer, useShell } from "@/features/app-shell";
import { COLOR_KEYS, CONNECTIONS, ESSENTIAL_KEYS, SWITCHES, extraKeys, shadowedKeys } from "../api/fields";
import type { AccountLayout } from "../api/load-values";
import { NOT_AVAILABLE, connectionRowText } from "../api/connections";
import { applyBrandToDocument, changedBusinessPatch, type BusinessPatch } from "../api/live-save";
import { filterSettings } from "../api/search";
import { initialState, settingsReducer, type SettingsState } from "../api/state";
import type { ConnectionStatus, SectionKey } from "../types";

// The shell's `updateBusiness`; when a shell does not offer it (a page rendered alone) the call is skipped.
// How long after a good save a newer server read is ignored. Same window as the brand cache's
// VERSION_SETTLING_MS (60s); a proposal, not a measured HighLevel delay.
const SAVE_SETTLING_MS = 60_000;

type ShellWithUpdate ={ updateBusiness?: (patch: Partial<BusinessPatch>, options?: { expires?: boolean }) => void };

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
  // Save really writes to the sub-account. Otherwise an applied edit lasts for this visit.
  live = false,
  // Given after a good read of the account: its keys decide which fields exist.
  account?: AccountLayout,
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
  const arrivedSave = useRef(state.ok ? state.values : null);
  const lastValues = useRef(state.values);
  // Keys with a value too long to send are listed by name, read-only (see settingsReadFrom).
  const longJoined = (account?.longKeys ?? []).join("|");
  const longKeys = useMemo(() => new Set(longJoined ? longJoined.split("|") : []), [longJoined]);
  const extras = useMemo(() => [...extraKeys(state.values), ...[...longKeys].filter((key) => !Object.hasOwn(state.values, key))], [state.values, longKeys]);
  // No key at all: the read failed or the account holds none of these values. A key with an empty
  // value is still a key, so a new client's blank account does not count.
  const notLoaded = Object.keys(state.values).length === 0;
  // The kept state outlives the page, so values that load on a later visit must replace the empty ones.
  useEffect(() => {
    if (notLoaded && initialValues && Object.keys(initialValues).length > 0) dispatch({ type: "loaded", values: initialValues });
  }, [notLoaded, initialValues, dispatch]);
  // A newer server read replaces kept values the owner has not edited, so a later template copy or an
  // edit in HighLevel shows up. Runs only when the server's values change, never while a save runs and
  // never just after a good save: HighLevel can still answer with the old value then (the refresh that
  // follows a save), and that read must not put the old value or the old brand back.
  const stateRef = useRef(state);
  const savedAt = useRef(0);
  useEffect(() => {
    stateRef.current = state;
  });
  useEffect(() => {
    const now = stateRef.current;
    if (!initialValues || now.saving || Object.keys(now.values).length === 0) return;
    if (Date.now() - savedAt.current < SAVE_SETTLING_MS) return;
    const newer = Object.entries(initialValues).some(
      ([key, value]) => now.values[key] !== value && (now.draft[key] ?? "") === (now.values[key] ?? ""),
    );
    if (newer) dispatch({ type: "serverValues", values: initialValues });
  }, [initialValues, dispatch]);
  // A key the reader ignores, or one the account no longer has, gets no field, unless the owner has
  // an unsaved edit in it. An empty read proves nothing, so it removes no field.
  const hidden = useMemo(() => {
    const out = shadowedKeys(state.values);
    const present = account && initialValues ? [...Object.keys(initialValues), ...longKeys] : [];
    if (present.length > 0) {
      for (const key of [...ESSENTIAL_KEYS, ...COLOR_KEYS, ...extras]) if (!present.includes(key)) out.add(key);
    }
    for (const key of out) if ((state.draft[key] ?? "").trim() !== (state.values[key] ?? "").trim()) out.delete(key);
    return out;
  }, [state.values, state.draft, account, initialValues, extras, longKeys]);
  const phone = (state.values.business_phone_number ?? "").trim();
  // With a tenant's real values the choices have no source yet, so they read "Not available yet".
  const choicesAvailable = initialValues === undefined;
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
      out[`sw-${i}`] = `${label} ${choicesAvailable ? (state.sw[i] ? "On" : "Off") : NOT_AVAILABLE}`;
    });
    return out;
  }, [connections, phone, state.how, state.asked, state.sw, choicesAvailable]);
  const filter = useMemo(() => filterSettings(state.q, extras, rowText, hidden), [state.q, extras, rowText, hidden]);
  const shell = useShell() as ShellWithUpdate;
  // Held in a ref so a new function identity from the shell never re-runs the Save effect (no loop).
  const updateRef = useRef(shell.updateBusiness);
  useEffect(() => {
    updateRef.current = shell.updateBusiness;
  });

  useEffect(() => {
    const main = document.querySelector(".fd-main");
    if (main) main.scrollTop = 0;
  }, [state.sec, state.open]);

  // After the scroll above: when an error switches section, the field and its message stay in view.
  useEffect(() => {
    if (!state.focus || state.focus === arrivedFocus.current) return;
    document.getElementById(`cv-${state.focus.key}`)?.focus();
  }, [state.focus]);

  useEffect(() => {
    const before = lastValues.current;
    lastValues.current = state.values;
    // A save kept from an earlier visit is not new, and must not cover a later edit.
    if (!state.ok || state.values === arrivedSave.current) return;
    savedAt.current = Date.now();
    applyBrandToDocument(document, state.values);
    const patch = changedBusinessPatch(before, state.values);
    if (live) updateRef.current?.(patch, { expires: true });
    else updateRef.current?.(patch);
  }, [state.ok, state.values, live]);

  return { state, dispatch, filter, extras, longKeys, phone, choicesAvailable, notLoaded };
}
