"use client";

import { useState, type Dispatch } from "react";
import { SAVE_FAILED, SAVE_LIMITED, saveProblem } from "../api/save-summary";
import { prepareSave, type SettingsAction, type SettingsState } from "../api/state";
import type { SaveValues } from "../types";

const MAX_AT_ONCE = 20;

// Hands the owner's changes to `send`, which saves them to the sub-account. Only what it confirms
// counts as saved. The form's own errors and "nothing changed" stay with the reducer.
export function useSaveValues(state: SettingsState, dispatch: Dispatch<SettingsAction>, send: SaveValues | undefined) {
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function save() {
    if (saving || !send) return;
    setProblem(null);
    const prepared = prepareSave(state);
    if (prepared.problem || prepared.changedKeys.length === 0) {
      dispatch({ type: "save" });
      return;
    }
    if (prepared.changedKeys.length > MAX_AT_ONCE) {
      setProblem(`Save at most ${MAX_AT_ONCE} changes at once.`);
      return;
    }
    const submitted = prepared.trimmed;
    dispatch({ type: "normalize", draft: submitted });
    setSaving(true);
    try {
      const answer = await send(prepared.changedKeys.map((key) => ({ key, expected: state.values[key] ?? "", value: submitted[key] ?? "" })));
      if (answer.kind === "limited") setProblem(SAVE_LIMITED);
      else if (answer.kind === "failed") setProblem(SAVE_FAILED);
      else {
        dispatch({ type: "remoteSaved", results: answer.results, submitted });
        setProblem(saveProblem(answer.results));
      }
    } catch {
      setProblem(SAVE_FAILED);
    } finally {
      setSaving(false);
    }
  }

  return { saving, problem, save };
}
