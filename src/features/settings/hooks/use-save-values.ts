"use client";

import { useEffect, useRef, type Dispatch } from "react";
import { SAVE_FAILED, SAVE_LIMITED, saveProblem } from "../api/save-summary";
import { prepareSave, type SettingsAction, type SettingsState } from "../api/state";
import { isClearableKey } from "../api/validate";
import type { SaveResult, SaveValues, ValueChange } from "../types";

// The server takes at most this many changes in one request.
export const MAX_AT_ONCE = 20;
const PARTLY_SAVED = "Some changes were saved, the rest were not.";

export type SaveScope = { step: string; keys: readonly string[]; allowClear?: boolean };

export function chunkChanges(changes: readonly ValueChange[]): ValueChange[][] {
  const out: ValueChange[][] = [];
  for (let i = 0; i < changes.length; i += MAX_AT_ONCE) out.push(changes.slice(i, i + MAX_AT_ONCE));
  return out;
}

// Hands one step's changes to `send`, which saves them to the sub-account. Only what it confirms
// counts as saved. More than the server's cap goes in sequential requests, stopping at the first that
// fails. A value is emptied only with `allowClear`, which the review step sets. Answers true when
// everything in the scope saved.
export function useSaveValues(state: SettingsState, dispatch: Dispatch<SettingsAction>, send: SaveValues | undefined) {
  const latest = useRef(state);
  useEffect(() => {
    latest.current = state;
  });

  async function save(scope: SaveScope): Promise<boolean> {
    const now = latest.current;
    if (now.saving || !send) return false;
    const prepared = prepareSave(now, scope.keys);
    if (prepared.problem || prepared.changedKeys.length === 0) {
      dispatch({ type: "saveEnd", problem: null });
      dispatch({ type: "save", keys: scope.keys, step: scope.step });
      return !prepared.problem;
    }
    const submitted = prepared.trimmed;
    const inScope = Object.fromEntries(scope.keys.filter((key) => key in submitted).map((key) => [key, submitted[key]]));
    dispatch({ type: "normalize", draft: { ...now.draft, ...inScope } });
    dispatch({ type: "saveStart", step: scope.step });
    const changes = prepared.changedKeys.map((key): ValueChange => {
      const value = submitted[key] ?? "";
      const change = { key, expected: now.values[key] ?? "", value };
      return !value && scope.allowClear && isClearableKey(key) ? { ...change, clear: true } : change;
    });
    const results: SaveResult[] = [];
    let stopped: string | null = null;
    try {
      for (const part of chunkChanges(changes)) {
        const answer = await send(part);
        if (answer.kind === "results") results.push(...answer.results);
        else {
          stopped = answer.kind === "limited" ? SAVE_LIMITED : SAVE_FAILED;
          break;
        }
      }
    } catch {
      stopped = SAVE_FAILED;
    }
    if (results.length > 0) dispatch({ type: "remoteSaved", results, submitted });
    const refused = saveProblem(results);
    const partly = stopped && results.some((r) => r.status === "saved") ? `${PARTLY_SAVED} ` : "";
    const problem = stopped ? `${partly}${stopped}${refused ? ` ${refused}` : ""}` : refused;
    dispatch({ type: "saveEnd", problem });
    return problem === null;
  }

  return { saving: state.saving, problem: state.saveProblem, save };
}
