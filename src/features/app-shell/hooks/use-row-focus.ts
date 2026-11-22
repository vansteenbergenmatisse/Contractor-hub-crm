"use client";

import { useEffect, useRef } from "react";
import { flashStyle, rowParam } from "../api/search";

// Brings the row a search result points at into view.
// A search result opens `<page>?row=<id>` (see `rowHref`). A page that wants this passes the ids
// of the rows it renders and puts `data-row-id={id}` on each row element. When the URL has `?row=`
// and that row is on screen, the hook scrolls it to the centre, focuses it when it is focusable,
// and lays the design's `.fx-flash` ring over it for 1.5 s. Each row id is handled once per mount;
// a page that ignores `?row=` simply opens at the top. Reads `window.location` (no useSearchParams,
// so a page needs no Suspense boundary).
export function useRowFocus(ids: readonly string[]): void {
  const done = useRef<string | null>(null);
  const key = ids.join("\u0000");
  useEffect(() => {
    const id = rowParam(window.location.search);
    if (!id || done.current === id || !key.split("\u0000").includes(id)) return;
    const row = Array.from(document.querySelectorAll<HTMLElement>("[data-row-id]")).find((el) => el.dataset.rowId === id);
    if (!row) return;
    done.current = id;
    row.scrollIntoView({ block: "center" });
    if (row.tabIndex >= 0) row.focus({ preventScroll: true });
    let remove: ReturnType<typeof setTimeout> | undefined;
    let ring: HTMLDivElement | null = null;
    const show = setTimeout(() => {
      ring = document.createElement("div");
      ring.className = "fx-flash";
      ring.setAttribute("aria-hidden", "true");
      Object.assign(ring.style, flashStyle(row.getBoundingClientRect()), { pointerEvents: "none" });
      (row.closest(".fd-app") ?? document.body).appendChild(ring);
      remove = setTimeout(() => ring?.remove(), 1500);
    }, 140);
    return () => {
      clearTimeout(show);
      if (remove) clearTimeout(remove);
      ring?.remove();
    };
  }, [key]);
}
