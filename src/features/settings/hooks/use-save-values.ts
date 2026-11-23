"use client";

import type { Dispatch } from "react";
import { SAVE_FAILED, SAVE_LIMITED, saveProblem } from "../api/save-summary";
import { prepareSave, type SettingsAction, type SettingsState } from "../api/state";
import type { SaveValues } from "../types";

const MAX_AT_ONCE = 20;

// Hands the owner's changes to `send`, which saves them to the sub-account. Only what it confirms
// counts as saved. The form's own errors and "nothing changed" stay with the reducer.
export function useSaveValues(state: SettingsState, dispatch: Dispatch<SettingsAction>, send: SaveValues | undefined) {
  async function save() {
    if (state.saving || !send) return;
    const prepared = prepareSave(state);
    if (prepared.problem || prepared.changedKeys.length === 0) {
      dispatch({ type: "saveEnd", problem: null });
      dispatch({ type: "save" });
      return;
    }
    if (prepared.changedKeys.length > MAX_AT_ONCE) {
      dispatch({ type: "saveEnd", problem: `Save at most ${MAX_AT_ONCE} changes at once.` });
      return;
    }
    const submitted = prepared.trimmed;
    dispatch({ type: "normalize", draft: submitted });
    dispatch({ type: "saveStart" });
    let problem: string | null = SAVE_FAILED;
    try {
      const answer = await send(prepared.changedKeys.map((key) => ({ key, expected: state.values[key] ?? "", value: submitted[key] ?? "" })));
      if (answer.kind === "limited") problem = SAVE_LIMITED;
      else if (answer.kind === "results") {
        dispatch({ type: "remoteSaved", results: answer.results, submitted });
        problem = saveProblem(answer.results);
      }
    } catch {
      problem = SAVE_FAILED;
    } finally {
      dispatch({ type: "saveEnd", problem });
    }
  }

  return { saving: state.saving, problem: state.saveProblem, save };
}
