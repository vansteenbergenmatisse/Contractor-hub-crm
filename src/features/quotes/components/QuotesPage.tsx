"use client";

import { useMemo } from "react";
import { useBusiness, useBusinessValues, usePushed, useRowFocus, useSearchRows, useShell } from "@/features/app-shell";
import { buildDraftOf, checkBuild, filterCounts, quoteSearchRows, rowFillId, sendRequest, totals, uploadName } from "../api/quotes";
import { sheetBusiness } from "../api/sheet-business";
import { useQuoteLink } from "../hooks/use-quote-link";
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

const width = () => { try { return window.innerWidth; } catch { return 1280; } };

// "See the quote", as the design: on a phone (under 1024px) the sheet is the whole screen, so the page
// goes back to its top (`top()`) and the focus moves into the sheet (no ring: it is not a control); when
// the sheet sits under the list (1024 to 1199px) it is brought into view (`uxStack`); on a wide screen
// the sheet already shows beside the list and nothing moves.
function revealSheet() {
  const w = width();
  if (w < 1024) {
    document.querySelector(".fd-main")?.scrollTo?.({ top: 0 });
    setTimeout(() => document.getElementById(SHEET_ID)?.focus({ preventScroll: true }), 0);
  } else if (w < 1200) {
    setTimeout(() => document.querySelector(".fd-side2")?.scrollIntoView?.({ block: "start" }), 120);
  }
}

// Page content only. The shell supplies the fd-view wrapper. Local state against mock data: nothing is
// sent, fetched or stored. "Approve and send" opens the shared 20 second timer and, at 0, only marks the
// quote Sent on screen.
export function QuotesPage() {
  const shell = useShell();
  const business = sheetBusiness(useBusinessValues(), useBusiness().logoUrl ?? null);
  const [state, dispatch] = useQuotes();
  usePushed(state.doc);
  // Search finds the quotes as they are now (design: search reads the rendered rows).
  useSearchRows("quotes", useMemo(() => quoteSearchRows(state.quotes), [state.quotes]));

  const selected = state.quotes.find((q) => q.id === state.selectedId) ?? state.quotes[0];
  const sums = totals(state.quotes);
  const counts = filterCounts(state.quotes);
  const filledId = rowFillId(state.quotes);

  const see = (id: string) => { dispatch({ type: "see", id }); revealSheet(); };
  // A link: a search result only shows the row (all rows when a filter hides it) and useRowFocus
  // flashes it; Pipeline's See quote opens the sheet; Add price selects the quote on the list and puts
  // the cursor in its price field (design `addPrice`).
  const filter = useQuoteLink(state, {
    showAll: () => dispatch({ type: "filter", filter: "all" }),
    openSheet: see,
    addPrice: (id) => {
      dispatch({ type: "select", id });
      setTimeout(() => {
        const field = document.getElementById(`fd-qt-pr-${id}`);
        field?.scrollIntoView?.({ block: "center" });
        field?.focus({ preventScroll: true });
      }, 80);
    },
  });
  useRowFocus(state.quotes.map((q) => `quote-${q.id}`));
  // Back to the list: on a phone the row comes back into view (design `into`), and the focus goes back
  // to the row's "See the quote" button.
  const shut = () => {
    const id = state.selectedId;
    dispatch({ type: "shut" });
    setTimeout(() => {
      if (width() < 1024) document.getElementById(`fd-qt-${id}`)?.scrollIntoView?.({ block: "center" });
      document.getElementById(`fd-qt-v-${id}`)?.focus({ preventScroll: true });
    }, 60);
  };
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
  // "Upload your own quote", as the design: attaches a sample file name at once and opens no file picker.
  const attachSample = (id: string) => {
    const q = state.quotes.find((x) => x.id === id);
    if (q) dispatch({ type: "attach", id, file: uploadName(q.name) });
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
              <button key={key} type="button" className={"fd-flb" + (filter === key ? " is-on" : "")} aria-pressed={filter === key} aria-label={`${label}, ${counts[key]}`} onClick={() => dispatch({ type: "filter", filter: key })}>{label}</button>
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
                filter={filter}
                selected={q.id === state.selectedId}
                filled={q.id === filledId}
                canUndo={state.last?.id === q.id}
                draft={buildDraftOf(state, q)}
                onDraft={(change) => dispatch({ type: "build-draft", id: q.id, ...change })}
                onSee={() => see(q.id)}
                onApprove={() => approve(q.id)}
                onWon={() => dispatch({ type: "move", id: q.id, to: "won" })}
                onLost={() => lose(q.id)}
                onUndo={() => dispatch({ type: "undo" })}
                onBuild={(service, priceRaw) => build(q.id, service, priceRaw)}
                onUpload={() => attachSample(q.id)}
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
              draft={state.draft}
              error={state.editError}
              onDraft={(draft) => dispatch({ type: "edit-draft", draft })}
              onError={(message) => dispatch({ type: "edit-error", message })}
              onShut={shut}
              onEdit={() => dispatch({ type: "edit-start" })}
              onCancel={() => dispatch({ type: "edit-cancel" })}
              onSave={(name, lines) => dispatch({ type: "edit-save", id: selected.id, name, lines })}
              onUpload={() => attachSample(selected.id)}
              onRemoveFile={() => dispatch({ type: "detach", id: selected.id })}
              onApprove={() => approve(selected.id)}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
