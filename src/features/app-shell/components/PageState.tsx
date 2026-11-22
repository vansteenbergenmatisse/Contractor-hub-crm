"use client";

import { createContext, useContext, useEffect, useReducer, useState, type ReactNode, type Reducer } from "react";

// Page state that survives moving between pages, as in the design: a reply sent in Inbox, a quote
// built, an invoice sent stay that way when the owner goes to another page and comes back. The
// store lives in the signed-in layout (it stays mounted across client navigation) and is gone on
// a full reload or sign-out. Mock state only (Phase 2); nothing is saved anywhere.
type Store = Map<string, unknown>;

const PageStateContext = createContext<Store | null>(null);

export function PageStateProvider({ children }: { children: ReactNode }) {
  const [store] = useState<Store>(() => new Map());
  return <PageStateContext.Provider value={store}>{children}</PageStateContext.Provider>;
}

// useReducer whose state is kept under `key` while the shell is mounted. Outside the shell (tests
// that render a page alone) it behaves exactly like useReducer.
export function useKeptReducer<S, A, I>(
  key: string,
  reducer: Reducer<S, A>,
  initialArg: I,
  init: (arg: I) => S,
): [S, (action: A) => void] {
  const store = useContext(PageStateContext);
  const [state, dispatch] = useReducer(reducer, initialArg, (arg: I) =>
    store?.has(key) ? (store.get(key) as S) : init(arg),
  );
  useEffect(() => {
    store?.set(key, state);
  }, [store, key, state]);
  return [state, dispatch];
}
