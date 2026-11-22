"use client";

import { useEffect, useRef, useState } from "react";
import { useBusiness, useBusinessValues, usePushed, useRowFocus, useShell } from "@/features/app-shell";
import { checkBuild, filterCounts, isVisible, rowFillId, rowFromSearch, sendRequest, totals, uploadName } from "../api/quotes";
import { sheetBusiness } from "../api/sheet-business";
import { useQuotes } from "../hooks/use-quotes";
import { WIN_TILE, mockBuildLines } from "../mock";
import type { QuoteFilter } from "../types";
import { QuoteRow } from "./QuoteRow";
import { QuoteSheet, SHEET_ID } from "./QuoteSheet";

const FILTERS: ReadonlyArray<{ key: QuoteFilter; label: string }> = [
  { key: "all", label: "All" },
  { key: "ready", label: "To approve" },
  { key: "sent", label: "Sent" },
];

// Page content only. The shell supplies the fd-view wrapper. Local state against mock data: nothing is
// sent, fetched or stored. "Approve and send" opens the shared 20 second timer and, at 0, only marks the
// quote Sent on screen.
export function QuotesPage() {
  const shell = useShell();
  const business = sheetBusiness(useBusinessValues(), useBusiness().logoUrl ?? null);
  const [state, dispatch] = useQuotes();
  const fileInput = useRef<HTMLInputElement>(null);
  const uploadFor = useRef<string | null>(null);
  const [seen, setSeen] = useState(0);
  usePushed(state.doc);

  useEffect(() => {
    if (seen === 0) return;
    const sheet = document.getElementById(SHEET_ID);
    sheet?.scrollIntoView?.({ block: "start" });
    sheet?.focus({ preventScroll: true });
  }, [seen]);

  const selected = state.quotes.find((q) => q.id === state.selectedId) ?? state.quotes[0];
  const sums = totals(state.quotes);
  const counts = filterCounts(state.quotes);
  const filledId = rowFillId(state.quotes);

  const see = (id: string) => { dispatch({ type: "see", id }); setSeen((n) => n + 1); };
  // A link (?row=quote-<id>: a search result, or Add price / See quote on the Pipeline) selects that
  // quote when the page opens and again whenever the link changes while the page is open. A filter that
  // hides the row is cleared first, as in the design; useRowFocus then scrolls to the row and flashes it.
  const rowLink = useRowFocus(state.quotes.map((q) => `quote-${q.id}`)) ?? "";
  useEffect(() => {
    const pick = rowFromSearch(`?row=${encodeURIComponent(rowLink)}`, state.quotes);
    if (!pick) return;
    const linked = state.quotes.find((q) => q.id === pick.id);
    if (linked && !isVisible(linked, state.filter)) dispatch({ type: "filter", filter: "all" });
    const timer = setTimeout(() => {
      if (pick.see) { see(pick.id); return; }
      dispatch({ type: "select", id: pick.id });
      setTimeout(() => {
        const field = document.getElementById(`fd-qt-pr-${pick.id}`);
        field?.scrollIntoView?.({ block: "center" });
        field?.focus({ preventScroll: true });
      }, 0);
    }, 0);
    return () => clearTimeout(timer);
    // Runs when the link changes; later changes of the list must not re-select the linked row.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rowLink]);
  const shut = () => { const id = state.selectedId; dispatch({ type: "shut" }); setTimeout(() => document.getElementById(`fd-qt-${id}`)?.focus(), 0); };
  const approve = (id: string) => {
    const q = state.quotes.find((x) => x.id === id);
    if (q) shell.sendTimer(sendRequest(q, () => dispatch({ type: "sent", id })));
  };
  const lose = (id: string) => {
    const q = state.quotes.find((x) => x.id === id);
    if (!q) return;
    shell.askReason({
      name: q.name,
      onPick: (reason) => dispatch(reason === "later" ? { type: "move", id, to: "later" } : { type: "move", id, to: "lost", why: reason }),
    });
  };
  const build = (id: string, service: string, priceRaw: string) => {
    const check = checkBuild(service, priceRaw);
    if (check.ok) dispatch({ type: "build", id, low: check.low, high: check.high, lines: mockBuildLines(check.service, check.low) });
  };
  // The owner's own quote file: only the file name is kept. Nothing is read or uploaded.
  const askUpload = (id: string) => { uploadFor.current = id; fileInput.current?.click(); };
  const picked = (files: FileList | null) => {
    const id = uploadFor.current;
    const q = state.quotes.find((x) => x.id === id);
    if (id && q) dispatch({ type: "attach", id, file: files?.[0]?.name || uploadName(q.name) });
    uploadFor.current = null;
    if (fileInput.current) fileInput.current.value = "";
  };

  return (
    <div className={"fd-dv" + (state.doc ? " is-doc" : "")}>
      <section className="fd-phd fd-in" style={{ "--i": 0 } as React.CSSProperties}>
        <h1 className="fd-pt">Quotes</h1>
        <p className="fd-pw">
          <span className="fd-wd">The AI builds each quote. You see it as the customer gets it, change what you want, then approve it with one press.</span>
          <span className="fd-wm">The AI builds each quote. You approve it with one press.</span>
        </p>
      </section>
      <div className="fd-cols fd-in" style={{ "--i": 1 } as React.CSSProperties}>
        <div>
          <section className="fd-sum fd-sumc" aria-label="In numbers">
            <div className="fd-smt"><p className="fd-smv">{sums.ready}</p><p className="fd-sml">{sums.readyLabel}</p></div>
            <div className="fd-smt"><p className="fd-smv">{sums.out}</p><p className="fd-sml">{sums.outLabel}</p></div>
            <div className="fd-smt"><p className="fd-smv">{WIN_TILE.value}</p><p className="fd-sml">{WIN_TILE.label}</p></div>
          </section>
          <div className="fd-fl" role="group" aria-label="Which rows show">
            {FILTERS.map(({ key, label }) => (
              <button key={key} type="button" className={"fd-flb" + (state.filter === key ? " is-on" : "")} aria-pressed={state.filter === key} aria-label={`${label}, ${counts[key]}`} onClick={() => dispatch({ type: "filter", filter: key })}>{label}</button>
            ))}
          </div>
          <div className="fx-emp">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d="M7 3h7l4 4v14H7z" /><path d="M14 3v4h4M10 12h5M10 16h5" /></svg>
            <p>No quotes in this view.</p>
            <button type="button" className="fd-btn is-plain" onClick={() => dispatch({ type: "filter", filter: "all" })}>Show all quotes</button>
          </div>
          <div className="fd-lst">
            {state.quotes.map((q) => (
              <QuoteRow
                key={q.id}
                quote={q}
                filter={state.filter}
                selected={q.id === state.selectedId}
                filled={q.id === filledId}
                canUndo={state.last?.id === q.id}
                onSee={() => see(q.id)}
                onApprove={() => approve(q.id)}
                onWon={() => dispatch({ type: "move", id: q.id, to: "won" })}
                onLost={() => lose(q.id)}
                onUndo={() => dispatch({ type: "undo" })}
                onBuild={(service, priceRaw) => build(q.id, service, priceRaw)}
                onUpload={() => askUpload(q.id)}
              />
            ))}
          </div>
        </div>
        <div className="fd-side2">
          {selected ? (
            <QuoteSheet
              key={selected.id}
              quote={selected}
              business={business}
              editing={state.editing}
              onShut={shut}
              onEdit={() => dispatch({ type: "edit-start" })}
              onCancel={() => dispatch({ type: "edit-cancel" })}
              onSave={(name, lines) => dispatch({ type: "edit-save", id: selected.id, name, lines })}
              onUpload={() => askUpload(selected.id)}
              onRemoveFile={() => dispatch({ type: "detach", id: selected.id })}
              onApprove={() => approve(selected.id)}
            />
          ) : null}
        </div>
      </div>
      <input ref={fileInput} type="file" hidden tabIndex={-1} accept=".pdf,.doc,.docx,.png,.jpg,.jpeg" onChange={(e) => picked(e.target.files)} />
    </div>
  );
}
