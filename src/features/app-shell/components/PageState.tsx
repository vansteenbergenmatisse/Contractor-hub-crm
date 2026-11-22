"use client";

import {
  createContext,
  useCallback,
  useContext,
  useReducer,
  useState,
  useSyncExternalStore,
  type ReactNode,
  type Reducer,
} from "react";

// Page state that survives moving between pages, as in the design: a reply sent in Inbox, a quote
// built, an invoice sent stay that way when the owner goes to another page and comes back. The
// store lives in the signed-in layout (it stays mounted across client navigation) and is gone on
// a full reload or sign-out. Mock state only (Phase 2); nothing is saved anywhere.
//
// The store owns each page's state and reducer, so an action dispatched after the page has gone
// (a 20-second send that finishes while the owner is on another page) still lands, and the page
// shows the result when it comes back.
type Entry = { state: unknown; reducer: Reducer<unknown, unknown> };

export type PageStore = {
  has(key: string): boolean;
  read(key: string): unknown;
  init(key: string, state: unknown, reducer: Reducer<unknown, unknown>): void;
  dispatch(key: string, action: unknown): void;
  subscribe(key: string, listener: () => void): () => void;
};

export function createPageStore(): PageStore {
  const entries = new Map<string, Entry>();
  const listeners = new Map<string, Set<() => void>>();
  return {
    has: (key) => entries.has(key),
    read: (key) => entries.get(key)?.state,
    init(key, state, reducer) {
      const entry = entries.get(key);
      if (entry) entry.reducer = reducer;
      else entries.set(key, { state, reducer });
    },
    dispatch(key, action) {
      const entry = entries.get(key);
      if (!entry) return;
      const next = entry.reducer(entry.state, action);
      if (Object.is(next, entry.state)) return;
      entry.state = next;
      listeners.get(key)?.forEach((l) => l());
    },
    subscribe(key, listener) {
      let set = listeners.get(key);
      if (!set) listeners.set(key, (set = new Set()));
      set.add(listener);
      return () => set.delete(listener);
    },
  };
}

const PageStateContext = createContext<PageStore | null>(null);

export function PageStateProvider({ children }: { children: ReactNode }) {
  const [store] = useState(createPageStore);
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
  const [localState, localDispatch] = useReducer(reducer, initialArg, (arg: I) => (store ? (undefined as S) : init(arg)));

  // The first visit seeds the state; later visits keep it. The latest reducer is stored on every
  // render, so a dispatch after the page has unmounted still runs the page's own logic.
  if (store) store.init(key, store.has(key) ? undefined : init(initialArg), reducer as Reducer<unknown, unknown>);

  const subscribe = useCallback((l: () => void) => (store ? store.subscribe(key, l) : () => {}), [store, key]);
  const read = useCallback(() => (store ? (store.read(key) as S) : undefined), [store, key]);
  const kept = useSyncExternalStore(subscribe, read, read);
  const dispatch = useCallback(
    (action: A) => (store ? store.dispatch(key, action) : localDispatch(action)),
    [store, key],
  );
  return [store ? (kept as S) : localState, dispatch];
}
