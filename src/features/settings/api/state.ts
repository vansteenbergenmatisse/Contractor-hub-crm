import { MOCK_CUSTOM_VALUES, MOCK_SWITCHES } from "../mock";
import type { CustomValues, Problem, SectionKey } from "../types";
import { validateValues } from "./validate";

// Local state. In Phase 3 Save writes values back to the sub-account's custom values behind an
// off-by-default flag. Here a good Save updates this state, and the hook applies the colors and the
// business details to this browser session only.
export type SettingsState = {
  values: CustomValues; // saved
  draft: CustomValues; // what the fields hold
  sw: [boolean, boolean];
  ok: boolean;
  err: Problem | null;
  cols: boolean; // color fields open
  how: Record<number, boolean>;
  asked: Record<number, boolean>;
  sec: SectionKey;
  open: boolean; // phone: a section is open as a pushed detail
  q: string;
  focus: { key: string; n: number } | null; // field to put the cursor in
};

export type SettingsAction =
  | { type: "go"; section: SectionKey }
  | { type: "back" }
  | { type: "search"; q: string }
  | { type: "edit"; key: string; value: string }
  | { type: "save" }
  | { type: "toggleCols" }
  | { type: "switch"; index: 0 | 1 }
  | { type: "how"; index: number }
  | { type: "ask"; index: number };

// `values` is the sub-account's own custom values (key to value). When given it replaces the sample
// values completely: a key the sub-account does not have shows an empty field. Without it the design's
// sample values are used (tests and the design only).
// `section` (from `?section=` in the URL) opens that section at once.
export function initialState(values?: CustomValues, section?: SectionKey): SettingsState {
  const start = values ?? MOCK_CUSTOM_VALUES;
  return {
    values: { ...start },
    draft: { ...start },
    sw: [...MOCK_SWITCHES],
    ok: false,
    err: null,
    cols: true,
    how: {},
    asked: {},
    sec: section ?? "biz",
    open: section !== undefined,
    q: "",
    focus: null,
  };
}

export function settingsReducer(s: SettingsState, a: SettingsAction): SettingsState {
  switch (a.type) {
    case "go":
      return { ...s, sec: a.section, open: true };
    case "back":
      return { ...s, open: false };
    case "search":
      return { ...s, q: a.q };
    case "edit":
      return { ...s, draft: { ...s.draft, [a.key]: a.value }, ok: false };
    case "toggleCols":
      return { ...s, cols: !s.cols };
    case "switch": {
      const sw: [boolean, boolean] = [...s.sw];
      sw[a.index] = !sw[a.index];
      return { ...s, sw };
    }
    case "how":
      return { ...s, how: { ...s.how, [a.index]: !s.how[a.index] } };
    case "ask":
      return { ...s, asked: { ...s.asked, [a.index]: true } };
    case "save": {
      const trimmed: CustomValues = {};
      for (const k of Object.keys(s.draft)) trimmed[k] = String(s.draft[k]).trim();
      const bad = validateValues(trimmed);
      if (bad) {
        return {
          ...s,
          ok: false,
          err: bad,
          sec: bad.section,
          open: true,
          cols: bad.section === "colors" ? true : s.cols,
          focus: { key: bad.key, n: (s.focus?.n ?? 0) + 1 },
        };
      }
      return { ...s, values: trimmed, draft: trimmed, ok: true, err: null };
    }
  }
}
