"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ROW_PICK_EVENT, flashStyle, rowParam } from "../api/search";
import { giveFxLayer, takeFxLayer } from "../api/fx-layer";

// useRowFocus(ids: readonly string[]): string | null
//
// Brings the row a search result points at into view (design logic `uxOpen` + `uxFlash`).
// A search result opens `<page>?row=<id>` (see `rowHref`). A page that wants this passes the ids of
// the rows it renders and puts `data-row-id={id}` on each row element. When `?row=` names one of
// those ids, the hook scrolls that row to the centre, focuses it when it is focusable (tabIndex >= 0
// or -1 set by the page), and 140 ms later lays the design's `.fx-flash` ring over it for 1.5 s.
// It reacts to `?row=` changing while the page is already open (a second search from the same page).
// Each `?row=` value is handled once until the parameter changes, or until the same search result is
// picked again (the shell's ROW_PICK_EVENT), which flashes the row again. The id is only compared with the
// page's own ids, never navigated to. Returns the `?row=` value (or null) so a page can also select it.
// Reads `useSearchParams` (the signed-in layout renders dynamically, so no Suspense is needed; a test
// without the Next router falls back to `window.location`).
export function useRowFocus(ids: readonly string[]): string | null {
  const params = useSearchParams();
  const row = params ? params.get("row") || null : typeof window === "undefined" ? null : rowParam(window.location.search);
  const done = useRef<string | null>(null);
  const current = useRef(row);
  const [again, setAgain] = useState(0);
  const key = ids.join("\u0000");
  useEffect(() => {
    current.current = row;
  });
  // The same result picked again while its `?row=` is already in the URL: the URL does not change,
  // so the pick itself asks for one more pass. A pick of another row waits for the URL instead.
  useEffect(() => {
    const onPick = (event: Event) => {
      const id = (event as CustomEvent<unknown>).detail;
      if (typeof id !== "string" || id !== current.current) return;
      done.current = null;
      setAgain((n) => n + 1);
    };
    window.addEventListener(ROW_PICK_EVENT, onPick);
    return () => window.removeEventListener(ROW_PICK_EVENT, onPick);
  }, []);
  useEffect(() => {
    if (!row) {
      done.current = null;
      return;
    }
    if (done.current === row || !key.split("\u0000").includes(row)) return;
    const el = Array.from(document.querySelectorAll<HTMLElement>("[data-row-id]")).find((node) => node.dataset.rowId === row);
    if (!el) return;
    done.current = row;
    el.scrollIntoView({ block: "center" });
    if (el.hasAttribute("tabindex") || el.tabIndex >= 0) el.focus({ preventScroll: true });
    let remove: ReturnType<typeof setTimeout> | undefined;
    let ring: HTMLDivElement | null = null;
    let layer: HTMLElement | null = null;
    const finish = () => {
      ring?.remove();
      ring = null;
      if (layer) giveFxLayer(layer);
      layer = null;
    };
    const show = setTimeout(() => {
      // The ring goes in the shared `#fx` layer over the app, like the design (api/fx-layer.ts).
      layer = takeFxLayer();
      ring = document.createElement("div");
      ring.className = "fx-flash";
      ring.setAttribute("aria-hidden", "true");
      Object.assign(ring.style, flashStyle(el.getBoundingClientRect()));
      layer.appendChild(ring);
      remove = setTimeout(finish, 1500);
    }, 140);
    return () => {
      clearTimeout(show);
      if (remove) clearTimeout(remove);
      finish();
    };
  }, [row, key, again]);
  return row;
}
