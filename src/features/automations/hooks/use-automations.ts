"use client";

import { useKeptReducer } from "@/features/app-shell";
import {
  NEW_TARGET, askRemove, closeEdit, draftOf, emptyDraft, initialState, keep, openEdit, openNew, remove, save, sendTest, toggle, undo,
} from "../api/automations";
import { mockAutomations } from "../mock";
import type { Draft, PageState } from "../types";

// The page state and the open editor's draft, kept together so both survive moving between pages
// (the shell's page store), as in the design.
type Kept = { page: PageState; draft: Draft };
type Action = (k: Kept) => Kept;

const reducer = (k: Kept, action: Action): Kept => action(k);
const init = (): Kept => ({ page: initialState(mockAutomations()), draft: emptyDraft() });

// Local page state only (Phase 2). Every action is a pure function from api/automations.ts.
export function useAutomations() {
  const [kept, dispatch] = useKeptReducer("automations", reducer, null, init);
  const { page: state, draft } = kept;

  const apply = (fn: (s: PageState) => PageState) => dispatch((k) => ({ ...k, page: fn(k.page) }));

  return {
    state,
    draft,
    setDraft: (change: Partial<Draft>) => dispatch((k) => ({ ...k, draft: { ...k.draft, ...change } })),
    toggle: (id: string) => apply((s) => toggle(s, id)),
    edit: (id: string) =>
      dispatch((k) => {
        const a = k.page.items.find((x) => x.id === id);
        return { page: openEdit(k.page, id), draft: a ? draftOf(a) : k.draft };
      }),
    make: () => dispatch((k) => ({ page: openNew(k.page), draft: emptyDraft() })),
    save: () => dispatch((k) => ({ ...k, page: save(k.page, k.draft) })),
    shut: () => apply(closeEdit),
    sendTest: () => apply(sendTest),
    ask: (id: string) => apply((s) => askRemove(s, id)),
    keep: () => apply(keep),
    remove: (id: string) => apply((s) => remove(s, id)),
    undo: () => apply(undo),
    isNew: state.edit === NEW_TARGET,
  };
}
