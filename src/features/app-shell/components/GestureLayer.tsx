"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { rowFocusTarget, type RowAction } from "../api/gestures";
import { useFxLayer } from "../hooks/use-fx-layer";
import { PullIndicator, type PullView } from "./PullIndicator";
import { RowMenu } from "./RowMenu";
import { SwipeStrip, type SwipeView } from "./SwipeStrip";

export type { PullView } from "./PullIndicator";
export type { SwipeView } from "./SwipeStrip";

// A request to open a row's menu. `touch` (a long press) or a phone width draws the phone menu: dimmed
// scrim and the pressed row lifted above it. `keyboard` puts focus on the first item.
export type MenuRequest = {
  anchor: HTMLElement;
  x: number;
  y: number;
  touch: boolean;
  keyboard: boolean;
  label: string;
  actions: readonly RowAction[];
};

export type GestureApi = {
  openMenu: (request: MenuRequest) => void;
  isMenuOpen: () => boolean;
  // When the open menu opened (ms), so the touch device's own contextmenu after a long press is ignored.
  menuOpenedAt: () => number;
  showSwipe: (view: SwipeView | null) => void;
  showPull: (view: PullView | null) => void;
  say: (text: string) => void;
};

const noop = () => {};
const NONE: GestureApi = { openMenu: noop, isMenuOpen: () => false, menuOpenedAt: () => 0, showSwipe: noop, showPull: noop, say: noop };
const GestureContext = createContext<GestureApi>(NONE);

// What the row, sheet, edge and pull hooks talk to. Outside a GestureLayer every call does nothing.
export function useGestures(): GestureApi {
  return useContext(GestureContext);
}

// The design's one layer over the app (logic `uxLayer`: `<div id="fx" class="fd-app brand-scope fx-root">`)
// for the row menu, the swipe colour strip and the refresh spinner. They are drawn into the shared `#fx`
// layer in document.body (api/fx-layer.ts) only while one of them shows, so a transformed row or page
// never shifts them and there is never a second `#fx`. AppShell renders one; a page test
// can wrap a page in its own. `onSay` speaks a polite line (design `uxSay`, e.g. "Call. Done.").
export function GestureLayer({ children, onSay }: { children: ReactNode; onSay?: (text: string) => void }) {
  const [menu, setMenu] = useState<{ request: MenuRequest; at: number } | null>(null);
  const [swipe, setSwipe] = useState<SwipeView | null>(null);
  const [pull, setPull] = useState<PullView | null>(null);
  const open = useRef<{ request: MenuRequest; at: number } | null>(null);
  const say = useRef(onSay);
  useEffect(() => {
    say.current = onSay;
  });

  const api = useMemo<GestureApi>(
    () => ({
      openMenu: (request) => {
        if (!request.actions.length) return;
        const next = { request, at: Date.now() };
        open.current = next;
        setMenu(next);
      },
      isMenuOpen: () => open.current !== null,
      menuOpenedAt: () => open.current?.at ?? 0,
      showSwipe: setSwipe,
      showPull: setPull,
      say: (text) => say.current?.(text),
    }),
    [],
  );

  // Closing without choosing gives focus back to the row (design `uxClose`). After an item runs, focus
  // only goes back when the action left it nowhere.
  const close = (run?: RowAction) => {
    const request = open.current?.request;
    open.current = null;
    setMenu(null);
    if (!request) return;
    const back = () => {
      if (request.anchor.isConnected) rowFocusTarget(request.anchor)?.focus();
    };
    if (!run) {
      back();
      return;
    }
    setTimeout(() => {
      run.onAction();
      if (!document.activeElement || document.activeElement === document.body) back();
    }, 0);
  };

  // Escape closes the open menu wherever focus is (design `uxKeys`); the menu handles its other keys.
  const closeMenu = useRef(close);
  useEffect(() => {
    closeMenu.current = close;
  });
  const menuOn = menu !== null;
  useEffect(() => {
    if (!menuOn) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      closeMenu.current();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [menuOn]);

  const shown = menu !== null || swipe !== null || pull !== null;
  const layer = useFxLayer(shown);
  return (
    <GestureContext.Provider value={api}>
      {children}
      {layer
        ? createPortal(
            <>
              {swipe ? <SwipeStrip view={swipe} /> : null}
              {pull ? <PullIndicator view={pull} /> : null}
              {menu ? <RowMenu key={menu.at} request={menu.request} onClose={close} /> : null}
            </>,
            layer,
          )
        : null}
    </GestureContext.Provider>
  );
}
