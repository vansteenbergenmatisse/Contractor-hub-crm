import { CATCH_ALL, LAYOUT, arrangeKeys, type ArrangedGroup } from "./layout";

// The guided page: one step per HighLevel folder that holds a key on screen, in layout order
// (layout.ts), then the protected folders. Steps and their counts come from the keys present, so a
// new custom value shows up by itself. A key the account lacks is left out when the page is drawn.
export type StepId = string;
export type ProtectedId = string;
export type Step<Id extends string = StepId> = { id: Id; title: string; line: string; keys: readonly string[]; groups: readonly ArrangedGroup[]; protected: boolean };
export type StepKeys = Record<string, string[]>;
export type Arranged = { steps: Step[]; protectedSteps: Step[]; keys: StepKeys };

// Every step the layout knows, protected ones included, for ids and titles before any key is known.
export const LAYOUT_STEPS: readonly { id: string; title: string; protected: boolean }[] = [...LAYOUT, CATCH_ALL].map((f) => ({ id: f.id, title: f.title, protected: !!f.protected }));
export const PROTECTED_IDS: readonly string[] = LAYOUT.filter((f) => f.protected).map((f) => f.id);

// The steps for the keys on screen. Folders without keys are left out.
export function arrangeSteps(shown: readonly string[]): Arranged {
  const steps: Step[] = [];
  const protectedSteps: Step[] = [];
  const keys: StepKeys = {};
  for (const { id } of LAYOUT_STEPS) keys[id] = [];
  for (const { folder, groups, keys: own } of arrangeKeys(shown)) {
    const step: Step = { id: folder.id, title: folder.title, line: folder.line, keys: own, groups, protected: !!folder.protected };
    (step.protected ? protectedSteps : steps).push(step);
    keys[folder.id] = own;
  }
  return { steps, protectedSteps, keys };
}

// The keys on screen, per step id, in each step's order. Every layout id is present (empty when the
// account has none of its keys).
export const keysByStep = (shown: readonly string[]): StepKeys => arrangeSteps(shown).keys;

// `long`: keys listed by name only (value too long to send); they hold a value, so they count as filled.
export const filledCount = (keys: readonly string[], values: Readonly<Record<string, string>>, long: ReadonlySet<string> = new Set()) =>
  keys.filter((key) => long.has(key) || (values[key] ?? "").trim() !== "").length;

// A saved value the draft empties. These need the review step before a save.
export const clearedKeys = (keys: readonly string[], values: Readonly<Record<string, string>>, draft: Readonly<Record<string, string>>) =>
  keys.filter((key) => (values[key] ?? "").trim() !== "" && (draft[key] ?? "").trim() === "");
