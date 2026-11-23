import { MOCK_CUSTOM_VALUES, MOCK_SWITCHES } from "../mock";
import type { CustomValues, Problem, SaveResult, SectionKey } from "../types";
import { COLOR_KEYS, LINK_KEYS } from "./fields";
import { isSaved } from "./save-summary";
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
  | { type: "normalize"; draft: CustomValues }
  | { type: "remoteSaved"; results: readonly SaveResult[]; submitted: CustomValues }
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
    // No source holds a tenant's choices yet, so real values never start from the sample switches.
    sw: values ? [false, false] : [...MOCK_SWITCHES],
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

const BARE_HEX6 = /^[0-9a-f]{6}$/i;
const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:/i;
// Starts like a host name, with a dot, no spaces and no @ (an email address is not a link).
const BARE_LINK = /^[a-z0-9][^\s@]*\.[^\s@]+$/i;

const fixColor = (v: string) => (BARE_HEX6.test(v) ? `#${v}` : v);
// A host ending in one of these is a file name ("logo.png"), not a domain. Extensions that are also
// widely used country domains (such as .md or .ai) are left out on purpose.
const FILE_ENDING = /\.(png|jpe?g|gif|webp|svg|bmp|ico|tiff?|heic|avif|pdf|docx?|xlsx?|pptx?|csv|txt|zip)$/i;
const hostOf = (v: string) => v.split(/[/?#]/, 1)[0];
const fixLink = (v: string) =>
  !HAS_SCHEME.test(v) && BARE_LINK.test(v) && !FILE_ENDING.test(hostOf(v)) ? `https://${v}` : v;

// Fills in what is unambiguous in the values the owner changed. Anything else, http:// included, is
// left as typed for the validator to refuse. A value he did not touch is never rewritten.
function withFixedInput(trimmed: CustomValues, saved: CustomValues): CustomValues {
  const out = { ...trimmed };
  const apply = (keys: readonly string[], fix: (v: string) => string) => {
    for (const k of keys) {
      const v = out[k];
      if (v !== undefined && v !== (saved[k] ?? "").trim()) out[k] = fix(v);
    }
  };
  apply(COLOR_KEYS, fixColor);
  apply(LINK_KEYS, fixLink);
  return out;
}

// What Save would store: the cleaned-up values, the form's first problem, and the keys that changed.
export function prepareSave(s: Pick<SettingsState, "draft" | "values">): { trimmed: CustomValues; problem: Problem | null; changedKeys: string[] } {
  const typed: CustomValues = {};
  for (const k of Object.keys(s.draft)) typed[k] = String(s.draft[k]).trim();
  const trimmed = withFixedInput(typed, s.values);
  // Only what the owner changed since the last save is checked (see validateValues).
  const problem = validateValues(trimmed, s.values);
  return { trimmed, problem, changedKeys: Object.keys(trimmed).filter((k) => trimmed[k] !== (s.values[k] ?? "").trim()) };
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
      // Typing leaves the applied line as it is. Editing the field with the error clears that error.
      return { ...s, draft: { ...s.draft, [a.key]: a.value }, err: s.err?.key === a.key ? null : s.err };
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
    case "normalize":
      return { ...s, draft: a.draft, err: null, ok: false };
    case "remoteSaved": {
      // Only what HighLevel confirmed becomes saved. A conflict moves the saved value to what the
      // account holds now and keeps the owner's text, so the next save starts from the real value.
      const values = { ...s.values };
      for (const result of a.results) {
        if (isSaved(result.status)) values[result.key] = a.submitted[result.key] ?? "";
        else if (result.status === "conflict" && result.current !== undefined) values[result.key] = result.current;
      }
      return { ...s, values, ok: a.results.some((result) => isSaved(result.status)) };
    }
    case "save": {
      const { trimmed, problem: bad, changedKeys } = prepareSave(s);
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
      // Nothing really changed: keep the stored values and make no claim that something was applied.
      if (changedKeys.length === 0) return { ...s, draft: s.values, err: null };
      return { ...s, values: trimmed, draft: trimmed, ok: true, err: null };
    }
  }
}
