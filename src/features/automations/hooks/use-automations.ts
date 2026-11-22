"use client";

import { useState } from "react";
import {
  NEW_TARGET, askRemove, closeEdit, draftOf, emptyDraft, initialState, keep, openEdit, openNew, remove, save, sendTest, toggle, undo,
} from "../api/automations";
import { mockAutomations } from "../mock";
import type { Draft, PageState } from "../types";

// Local page state only (Phase 2). Every action is a pure function from api/automations.ts.
export function useAutomations() {
  const [state, setState] = useState<PageState>(() => initialState(mockAutomations()));
  const [draft, setDraft] = useState<Draft>(emptyDraft);

  const apply = (fn: (s: PageState) => PageState) => setState((s) => fn(s));

  return {
    state,
    draft,
    setDraft: (change: Partial<Draft>) => setDraft((d) => ({ ...d, ...change })),
    toggle: (id: string) => apply((s) => toggle(s, id)),
    edit: (id: string) => {
      const a = state.items.find((x) => x.id === id);
      if (a) setDraft(draftOf(a));
      apply((s) => openEdit(s, id));
    },
    make: () => {
      setDraft(emptyDraft());
      apply(openNew);
    },
    save: () => apply((s) => save(s, draft)),
    shut: () => apply(closeEdit),
    sendTest: () => apply(sendTest),
    ask: (id: string) => apply((s) => askRemove(s, id)),
    keep: () => apply(keep),
    remove: (id: string) => apply((s) => remove(s, id)),
    undo: () => apply(undo),
    isNew: state.edit === NEW_TARGET,
  };
}
