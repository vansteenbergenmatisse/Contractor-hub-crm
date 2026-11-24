import { MOCK_CUSTOM_VALUES, MOCK_SWITCHES } from "../mock";
import type { CustomValues, Problem, SaveResult, SectionKey } from "../types";
import { COLOR_KEYS, LINK_KEYS } from "./fields";
import { folderIdOfKey } from "./folders";
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
  cols: boolean; // color fields open on the Brand colors view and in a search
  folders: Record<string, boolean>; // Business details: folders the owner opened or closed
  searchClosed: Record<string, boolean>; // folders closed during the current search
  how: Record<number, boolean>;
  asked: Record<number, boolean>;
  sec: SectionKey;
  open: boolean; // phone: a section is open as a pushed detail
  q: string;
  focus: { key: string; n: number } | null; // field to put the cursor in
  // Kept here, not in the page, so a save that outlives the page still shows when the owner returns.
  saving: boolean;
  saveProblem: string | null;
  // The step the last save belongs to, so its result shows on that card.
  saveStep: string | null;
};

export type SettingsAction =
  | { type: "go"; section: SectionKey }
  | { type: "back" }
  | { type: "search"; q: string }
  | { type: "edit"; key: string; value: string }
  | { type: "save"; keys?: readonly string[]; step?: string }
  | { type: "revert"; keys: readonly string[] }
  | { type: "normalize"; draft: CustomValues }
  | { type: "remoteSaved"; results: readonly SaveResult[]; submitted: CustomValues }
  // Change image: what the account now holds for this key. `saved`: this change put it there.
  | { type: "imageValue"; key: string; value: string; saved: boolean }
  | { type: "saveStart"; step?: string }
  | { type: "saveEnd"; problem: string | null }
  | { type: "loaded"; values: CustomValues }
  | { type: "toggleCols" }
  | { type: "setFolder"; id: string; open: boolean }
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
    folders: {},
    searchClosed: {},
    how: {},
    asked: {},
    sec: section ?? "biz",
    open: section !== undefined,
    q: "",
    focus: null,
    saving: false,
    saveProblem: null,
    saveStep: null,
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

function pick(from: CustomValues, keys: readonly string[]): CustomValues {
  return Object.fromEntries(keys.filter((k) => Object.hasOwn(from, k)).map((k) => [k, from[k]]));
}

// What Save would store: the cleaned-up values, the form's first problem, and the keys that changed.
// With `scope` only those keys count: another step's unsaved edit is neither checked nor sent.
export function prepareSave(s: Pick<SettingsState, "draft" | "values">, scope?: readonly string[]): { trimmed: CustomValues; problem: Problem | null; changedKeys: string[] } {
  const source = scope ? { ...s.values, ...pick(s.draft, scope) } : s.draft;
  const typed: CustomValues = {};
  for (const k of Object.keys(source)) typed[k] = String(source[k]).trim();
  const trimmed = withFixedInput(typed, s.values);
  // Only what the owner changed since the last save is checked (see validateValues).
  const problem = validateValues(trimmed, s.values);
  return { trimmed, problem, changedKeys: Object.keys(trimmed).filter((k) => trimmed[k] !== (s.values[k] ?? "").trim()) };
}

// Fields whose text differs from the saved value. Spaces around a value are not a change: Save trims them.
export function dirtyKeysOf(values: CustomValues, draft: CustomValues): string[] {
  return Object.keys({ ...values, ...draft }).filter((k) => (draft[k] ?? "").trim() !== (values[k] ?? "").trim());
}

export function settingsReducer(s: SettingsState, a: SettingsAction): SettingsState {
  switch (a.type) {
    case "go":
      return { ...s, sec: a.section, open: true };
    case "back":
      return { ...s, open: false };
    case "search":
      // Starting a search opens the colors, and each new query opens every folder with a match.
      return { ...s, q: a.q, searchClosed: {}, cols: !s.q.trim() && a.q.trim() ? true : s.cols };
    case "edit":
      // Typing leaves the applied line as it is. Editing the field with the error clears that error.
      return { ...s, draft: { ...s.draft, [a.key]: a.value }, err: s.err?.key === a.key ? null : s.err };
    case "toggleCols":
      return { ...s, cols: !s.cols };
    case "setFolder":
      return s.q.trim()
        ? { ...s, searchClosed: { ...s.searchClosed, [a.id]: !a.open } }
        : { ...s, folders: { ...s.folders, [a.id]: a.open } };
    case "revert": {
      const draft = { ...s.draft };
      for (const key of a.keys) {
        if (Object.hasOwn(s.values, key)) draft[key] = s.values[key];
        else delete draft[key];
      }
      return { ...s, draft, err: s.err && a.keys.includes(s.err.key) ? null : s.err };
    }
    case "switch": {
      const sw: [boolean, boolean] = [...s.sw];
      sw[a.index] = !sw[a.index];
      return { ...s, sw };
    }
    case "how":
      return { ...s, how: { ...s.how, [a.index]: !s.how[a.index] } };
    case "ask":
      return { ...s, asked: { ...s.asked, [a.index]: true } };
    case "saveStart":
      return { ...s, saving: true, saveProblem: null, saveStep: a.step ?? s.saveStep };
    case "saveEnd":
      return { ...s, saving: false, saveProblem: a.problem };
    case "loaded": {
      // The values arrived after a failed read. What the owner typed meanwhile stays in the fields.
      const typed = Object.fromEntries(Object.entries(s.draft).filter(([, v]) => v.trim() !== ""));
      return { ...s, values: { ...a.values }, draft: { ...a.values, ...typed } };
    }
    case "normalize":
      return { ...s, draft: a.draft, err: null, ok: false };
    case "imageValue":
      return {
        ...s,
        values: { ...s.values, [a.key]: a.value },
        draft: { ...s.draft, [a.key]: a.value },
        err: s.err?.key === a.key ? null : s.err,
        ok: a.saved ? true : s.ok,
      };
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
      const { trimmed, problem: bad, changedKeys } = prepareSave(s, a.keys);
      const saveStep = a.step ?? s.saveStep;
      if (bad) {
        // The bad field must be visible, whichever folder holds it.
        const folder = folderIdOfKey(bad.key);
        return {
          ...s,
          folders: { ...s.folders, [folder]: true },
          searchClosed: { ...s.searchClosed, [folder]: false },
          ok: false,
          saveStep,
          err: bad,
          sec: bad.section,
          open: true,
          cols: bad.section === "colors" ? true : s.cols,
          focus: { key: bad.key, n: (s.focus?.n ?? 0) + 1 },
        };
      }
      // Nothing really changed: keep the stored values and make no claim that something was applied.
      if (changedKeys.length === 0) return { ...s, draft: a.keys ? { ...s.draft, ...pick(s.values, a.keys) } : s.values, err: null };
      return { ...s, values: trimmed, draft: a.keys ? { ...s.draft, ...pick(trimmed, a.keys) } : trimmed, ok: true, err: null, saveStep };
    }
  }
}
