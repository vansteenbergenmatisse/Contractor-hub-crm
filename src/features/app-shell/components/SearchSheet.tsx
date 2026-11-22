"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { pushRecent, searchRows } from "../api/search";
import type { SearchRow } from "../types";

const SCOPES: ReadonlyArray<readonly ["all" | SearchRow["page"], string]> = [
  ["all", "All"], ["leads", "Leads"], ["pipeline", "Pipeline"], ["quotes", "Quotes"],
  ["invoices", "Invoices"], ["payments", "Payments"], ["inbox", "Messages"],
];

// One search over every customer row: results while you type, grouped by page, with a scope bar.
// Phase 2 searches the mock rows the layout hands in; Phase 3 asks the backend.
export function SearchSheet({ rows, onClose, onOpen }: { rows: readonly SearchRow[]; onClose: () => void; onOpen: (row: SearchRow) => void }) {
  const [term, setTerm] = useState("");
  const [scope, setScope] = useState<"all" | SearchRow["page"]>("all");
  const [active, setActive] = useState(0);
  const [recent, setRecent] = useState<string[]>([]);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), []);

  const groups = useMemo(() => searchRows(rows, term, scope), [rows, term, scope]);
  const flat = groups.flatMap((g) => g.hits);

  const open = (row: SearchRow) => {
    setRecent((r) => pushRecent(r, term));
    onOpen(row);
  };

  return (
    <div id="fx" className="fd-app brand-scope fx-root">
      <div className="fx-scrim fx-sscrim" onClick={onClose} />
      <div className="fx-search" role="dialog" aria-modal="true" aria-label="Search">
        <div className="fx-sbar">
          <span className="fx-sfield">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
            <label className="fx-vh" htmlFor="fx-sq">Search customers, quotes and invoices</label>
            <input
              id="fx-sq" ref={input} className="fx-sin" type="search" role="combobox" aria-expanded="true"
              aria-controls="fx-sres" aria-autocomplete="list" autoComplete="off" spellCheck={false}
              placeholder="Customers, quotes, invoices" value={term}
              aria-activedescendant={flat[active] ? `fx-o${active}` : undefined}
              onChange={(e) => { setTerm(e.target.value); setActive(0); }}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                  e.preventDefault();
                  if (flat.length) setActive((a) => (a + (e.key === "ArrowDown" ? 1 : flat.length - 1)) % flat.length);
                } else if (e.key === "Enter") {
                  e.preventDefault();
                  if (flat[active]) open(flat[active]);
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  if (term) setTerm(""); else onClose();
                }
              }}
            />
          </span>
          <button type="button" className="fx-scx" onClick={onClose}>Cancel</button>
        </div>
        <div className="fx-scope" role="radiogroup" aria-label="Search in">
          {SCOPES.map(([key, label]) => (
            <button key={key} type="button" role="radio" aria-checked={scope === key} tabIndex={scope === key ? 0 : -1} className={`fx-sc${scope === key ? " is-on" : ""}`} onClick={() => { setScope(key); setActive(0); }}>{label}</button>
          ))}
        </div>
        <div className="fx-sres" id="fx-sres" role="listbox" aria-label="Results">
          {!term.trim() ? (
            recent.length ? (
              <div className="fx-sg" role="group" aria-label="Recent searches">
                <p className="fx-sgh">Recent searches</p>
                {recent.map((r) => (
                  <div key={r} className="fx-so" role="option" aria-selected="false" onClick={() => setTerm(r)}><div className="fx-sox"><p className="fx-son">{r}</p></div></div>
                ))}
              </div>
            ) : <p className="fx-sempty">Type a name, a job, a street or an invoice number.</p>
          ) : groups.length === 0 ? (
            <p className="fx-sempty">{`No results for “${term.trim()}”. Check the spelling or try a street name.`}</p>
          ) : (
            groups.map((group) => (
              <div key={group.key} className="fx-sg" role="group" aria-label={group.title}>
                <p className="fx-sgh">{group.title}</p>
                {group.hits.map((row) => {
                  const index = flat.indexOf(row);
                  return (
                    <div key={row.id} id={`fx-o${index}`} className={`fx-so${index === active ? " is-act" : ""}`} role="option" aria-selected={index === active} onClick={() => open(row)} onMouseMove={() => setActive(index)}>
                      <div className="fx-sox"><p className="fx-son">{row.name}</p>{row.sub ? <p className="fx-sos">{row.sub}</p> : null}</div>
                      <svg className="fx-soc" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d="m9 6 6 6-6 6" /></svg>
                    </div>
                  );
                })}
                {scope === "all" && group.total > group.hits.length ? (
                  <button type="button" className="fx-smore" onClick={() => { setScope(group.key); setActive(0); }}>{`Show all ${group.total} in ${group.title}`}</button>
                ) : null}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
