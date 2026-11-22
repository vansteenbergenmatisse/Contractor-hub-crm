"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { highlight, nextScope, pushRecent, rowHref, searchPlacement, searchRows, shortcutHint, trapTab } from "../api/search";
import { createFocusReturn } from "../api/focus";
import { detectMac } from "../api/keys";
import { useWindowWidth } from "../hooks/use-window-width";
import type { SearchRow } from "../types";
import { Icon } from "./Icon";

type Scope = "all" | SearchRow["page"];
const SCOPES: ReadonlyArray<readonly [Scope, string]> = [
  ["all", "All"], ["leads", "Leads"], ["pipeline", "Pipeline"], ["quotes", "Quotes"],
  ["invoices", "Invoices"], ["payments", "Payments"], ["inbox", "Messages"],
];
const SCOPE_KEYS = SCOPES.map(([key]) => key);

// The top Search field's box, when it is on screen (computer layout).
function anchorBox(): { top: number; right: number } | null {
  if (typeof document === "undefined") return null;
  const field = document.querySelector(".fd-top .fd-search");
  if (!field) return null;
  const rect = field.getBoundingClientRect();
  return rect.width && rect.height ? { top: rect.top, right: rect.right } : null;
}

// One search over every customer row: results while you type, grouped by page, with a scope bar.
// Below 1024px it is a full-screen sheet (`is-ph`: field at the bottom, following the keyboard);
// on a computer it sits under the top Search field. Phase 2 searches the mock rows the layout hands
// in; Phase 3 asks the backend. `viewportWidth` and `isMac` stand in where there is no window
// (server render, tests). Opening a result hands `onOpen` the row with `?row=<id>` on its link.
// `recent` and `onRecentChange` keep the recent searches outside the sheet (the shell holds them,
// so they survive closing and opening search); without them the sheet keeps its own list.
export function SearchSheet({ rows, onClose, onOpen, viewportWidth, isMac, recent: heldRecent, onRecentChange }: {
  rows: readonly SearchRow[];
  onClose: () => void;
  onOpen: (row: SearchRow) => void;
  viewportWidth?: number;
  isMac?: boolean;
  recent?: readonly string[];
  onRecentChange?: (recent: string[]) => void;
}) {
  const [term, setTerm] = useState("");
  const [scope, setScope] = useState<Scope>("all");
  const [active, setActive] = useState(0);
  const [ownRecent, setOwnRecent] = useState<string[]>([]);
  const recent = heldRecent ?? ownRecent;
  const input = useRef<HTMLInputElement>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const [back] = useState(createFocusReturn);
  const width = useWindowWidth(viewportWidth ?? null);
  const placement = useMemo(() => searchPlacement(width ?? 0, width !== null && width >= 1024 ? anchorBox() : null), [width]);
  const phone = placement.phone;
  const mac = isMac ?? detectMac();

  // Focus the field; give focus back to the opener on close (not when a result was opened).
  useEffect(() => {
    back.remember(document.activeElement);
    input.current?.focus();
    return () => back.restore();
  }, [back]);

  // Phone: the field sits at the bottom, so the sheet follows the keyboard (visual viewport).
  useEffect(() => {
    const vv = typeof window === "undefined" ? null : window.visualViewport;
    const box = dialog.current;
    if (!phone || !vv || !box) return;
    const fit = () => {
      box.style.top = `${vv.offsetTop}px`;
      box.style.height = `${vv.height}px`;
      box.style.bottom = "auto";
    };
    vv.addEventListener("resize", fit);
    vv.addEventListener("scroll", fit);
    fit();
    return () => {
      vv.removeEventListener("resize", fit);
      vv.removeEventListener("scroll", fit);
      box.style.top = "";
      box.style.height = "";
      box.style.bottom = "";
    };
  }, [phone]);

  const groups = useMemo(() => searchRows(rows, term, scope), [rows, term, scope]);
  const typed = term.trim() !== "";
  const hits = groups.flatMap((g) => g.hits);
  // What the arrows and Enter move through: the hits, or the recent searches when nothing is typed.
  const count = typed ? hits.length : recent.length;
  const current = active < count ? active : 0;

  // Keep the marked option in view while the arrows move.
  useEffect(() => {
    if (count) dialog.current?.querySelector(`#fx-o${current}`)?.scrollIntoView({ block: "nearest" });
  }, [current, count]);

  const open = (row: SearchRow) => {
    const next = pushRecent(recent, term);
    if (onRecentChange) onRecentChange(next);
    else setOwnRecent(next);
    back.forget();
    onOpen({ ...row, href: rowHref(row) });
  };
  const pickRecent = (text: string) => {
    setTerm(text);
    setActive(0);
    input.current?.focus();
  };
  const choose = (index: number) => {
    if (typed) {
      if (hits[index]) open(hits[index]);
    } else if (recent[index] !== undefined) pickRecent(recent[index]);
  };
  const pickScope = (key: Scope) => {
    setScope(key);
    setActive(0);
  };

  const onDialogKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape" && !e.defaultPrevented) {
      e.preventDefault();
      onClose();
      return;
    }
    if (e.key !== "Tab" || !dialog.current) return;
    const items = Array.from(dialog.current.querySelectorAll<HTMLElement>("input, button")).filter((el) => el.tabIndex >= 0 && el.getClientRects().length > 0);
    const to = trapTab(items.indexOf(document.activeElement as HTMLElement), items.length, e.shiftKey);
    if (to === null) return;
    e.preventDefault();
    items[to].focus();
  };

  const onScopeKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const next = nextScope(SCOPE_KEYS, scope, e.key);
    if (!next) return;
    e.preventDefault();
    pickScope(next);
    e.currentTarget.querySelector<HTMLButtonElement>(`[data-k="${next}"]`)?.focus();
  };

  const optionId = (index: number) => `fx-o${index}`;
  const sbar = (
    <div className="fx-sbar">
      <span className="fx-sfield">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
        <label className="fx-vh" htmlFor="fx-sq">Search customers, quotes and invoices</label>
        <input
          id="fx-sq" ref={input} className="fx-sin" type="search" role="combobox" aria-expanded="true"
          aria-controls="fx-sres" aria-autocomplete="list" autoComplete="off" spellCheck={false}
          placeholder="Customers, quotes, invoices" value={term}
          aria-activedescendant={count ? optionId(current) : undefined}
          onChange={(e) => { setTerm(e.target.value); setActive(0); }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              e.preventDefault();
              if (count) setActive((current + (e.key === "ArrowDown" ? 1 : count - 1)) % count);
            } else if (e.key === "Enter") {
              e.preventDefault();
              choose(current);
            } else if (e.key === "Escape") {
              e.preventDefault();
              if (term) { setTerm(""); setActive(0); } else onClose();
            }
          }}
        />
        {phone && term ? (
          <button type="button" className="fd-link" aria-label="Clear search" onClick={() => { setTerm(""); setActive(0); input.current?.focus(); }}>
            <Icon name="close" size={16} strokeWidth={2} />
          </button>
        ) : null}
      </span>
      <button type="button" className="fx-scx" onClick={onClose}>Cancel</button>
    </div>
  );

  const chevron = <svg className="fx-soc" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d="m9 6 6 6-6 6" /></svg>;

  return (
    <div id="fx" className="fd-app brand-scope fx-root">
      <div className="fx-scrim fx-sscrim" onClick={onClose} />
      <div
        ref={dialog}
        className={`fx-search${phone ? " is-ph" : ""}`}
        role="dialog" aria-modal="true" aria-label="Search"
        style={placement.phone ? undefined : { left: placement.left, top: placement.top, width: placement.width }}
        onKeyDown={onDialogKey}
      >
        {sbar}
        <div className="fx-scope" role="radiogroup" aria-label="Search in" onKeyDown={onScopeKey}>
          {SCOPES.map(([key, label]) => (
            <button key={key} type="button" role="radio" data-k={key} aria-checked={scope === key} tabIndex={scope === key ? 0 : -1} className={`fx-sc${scope === key ? " is-on" : ""}`} onClick={() => pickScope(key)}>{label}</button>
          ))}
        </div>
        <div className="fx-sres" id="fx-sres" role="listbox" aria-label="Results">
          {!typed ? (
            recent.length ? (
              <div className="fx-sg" role="group" aria-labelledby="fx-g0">
                <p className="fx-sgh" id="fx-g0">Recent searches</p>
                {recent.map((r, index) => (
                  <div key={r} id={optionId(index)} className={`fx-so${index === current ? " is-act" : ""}`} role="option" aria-selected={index === current} onClick={() => pickRecent(r)} onMouseMove={() => setActive(index)}>
                    <div className="fx-sox"><p className="fx-son">{r}</p></div>
                    {chevron}
                  </div>
                ))}
              </div>
            ) : <p className="fx-sempty">Type a name, a job, a street or an invoice number.</p>
          ) : groups.length === 0 ? (
            <p className="fx-sempty">{`No results for “${term.trim()}”. Check the spelling or try a street name.`}</p>
          ) : (
            groups.map((group, g) => (
              <div key={group.key} className="fx-sg" role="group" aria-labelledby={`fx-g${g}`}>
                <p className="fx-sgh" id={`fx-g${g}`}>{group.title}</p>
                {group.hits.map((row) => {
                  const index = hits.indexOf(row);
                  const parts = highlight(row.name, term);
                  return (
                    <div key={row.id} id={optionId(index)} className={`fx-so${index === current ? " is-act" : ""}`} role="option" aria-selected={index === current} onClick={() => open(row)} onMouseMove={() => setActive(index)}>
                      <div className="fx-sox">
                        <p className="fx-son">{parts ? <>{parts[0]}<mark>{parts[1]}</mark>{parts[2]}</> : row.name}</p>
                        {row.sub ? <p className="fx-sos">{row.sub}</p> : null}
                      </div>
                      {chevron}
                    </div>
                  );
                })}
                {scope === "all" && group.total > group.hits.length ? (
                  <button type="button" className="fx-smore" onClick={() => { pickScope(group.key); input.current?.focus(); }}>{`Show all ${group.total} in ${group.title}`}</button>
                ) : null}
              </div>
            ))
          )}
        </div>
        {phone ? null : <p className="fx-shint"><kbd className="fx-k">{shortcutHint(mac)}</kbd><span>shows every keyboard shortcut</span></p>}
      </div>
    </div>
  );
}
