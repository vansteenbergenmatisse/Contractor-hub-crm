"use client";

import { amountLabel, canApprove, canEdit, canUpload, checkEdit, formatMoney } from "../api/quotes";
import { joinParts } from "@/shared/lib/join-parts";
import { hasBusinessHeader, type SheetBusiness } from "../api/sheet-business";
import type { EditDraft, Quote, QuoteLine } from "../types";
import { BrandLogo } from "@/shared/ui/brand-logo";
import { StatusChip } from "./StatusChip";

const svg = { fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true, focusable: "false" } as const;

export const SHEET_ID = "fd-qt-sheet";

export type QuoteSheetProps = {
  quote: Quote;
  business: SheetBusiness;
  editing: boolean;
  // The edit fields and their error (kept state, so an edit survives a page change).
  draft: EditDraft;
  error: string;
  onDraft: (draft: EditDraft) => void;
  onError: (message: string) => void;
  onShut: () => void;
  onEdit: () => void;
  onCancel: () => void;
  onSave: (name: string, lines: QuoteLine[]) => void;
  onUpload: () => void;
  onRemoveFile: () => void;
  onApprove: () => void;
};

// The quote as the customer gets it, with a few fields when the owner edits it.
export function QuoteSheet(p: QuoteSheetProps) {
  const { quote: q, business: b } = p;
  const { draft, error } = p;

  const start = () => { p.onEdit(); setTimeout(() => document.getElementById("fd-qe-name")?.focus(), 0); };
  const save = () => {
    const check = checkEdit(draft);
    if (!check.ok) { p.onError(check.message); document.getElementById(`fd-qe-${check.field}`)?.focus(); return; }
    p.onSave(check.name, check.lines);
  };
  const setLine = (k: number, key: "text" | "amount", value: string) =>
    p.onDraft({ ...draft, lines: draft.lines.map((l, i) => (i === k ? { ...l, [key]: value } : l)) });

  const range = Boolean(q.high);
  const shownLines = q.file ? [] : q.lines;

  return (
    <section className="fd-pnl fd-doc" aria-label="The quote the customer gets" aria-live="polite" id={SHEET_ID} tabIndex={-1} style={{ outline: "none" }}>
      <button type="button" className="fd-link fd-aback" onClick={p.onShut}>
        <svg className="fd-flip" width={16} height={16} viewBox="0 0 24 24" {...svg} strokeWidth={2.2}><path d="m9 6 6 6-6 6" /></svg>Back to the list
      </button>
      <div className="fd-dchd fd-dchu">
        <p className="fd-dcl fd-dct">What the customer gets, in short</p>
        {canUpload(q) && !p.editing ? <button type="button" className="fd-link fd-shed" onClick={p.onUpload}>Upload your own quote</button> : null}
        {canEdit(q) && !p.editing ? (
          <button type="button" className="fd-link fd-shed" onClick={start}>
            <svg width={14} height={14} viewBox="0 0 24 24" {...svg}><path d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4" /></svg>Edit
          </button>
        ) : null}
      </div>

      {p.editing ? (
        <div className="fd-she">
          <label className="fd-ll" htmlFor="fd-qe-name">Customer name</label>
          <input className="fd-lin" id="fd-qe-name" type="text" autoComplete="off" value={draft.name} onChange={(e) => p.onDraft({ ...draft, name: e.target.value })} />
          {draft.lines.map((line, k) => (
            <div className="fd-shl" key={k}>
              <div className="fd-ivf">
                <label className="fd-ll" htmlFor={`fd-qe-t${k}`}>{`Line ${k + 1}`}</label>
                <input className="fd-lin" id={`fd-qe-t${k}`} type="text" autoComplete="off" value={line.text} onChange={(e) => setLine(k, "text", e.target.value)} />
              </div>
              <div className="fd-shp">
                <label className="fd-ll" htmlFor={`fd-qe-a${k}`}>Price</label>
                <input className="fd-lin" id={`fd-qe-a${k}`} type="text" inputMode="decimal" autoComplete="off" value={line.amount} onChange={(e) => setLine(k, "amount", e.target.value)} />
              </div>
            </div>
          ))}
          {error ? <p className="fd-lerr" role="alert"><svg width={16} height={16} viewBox="0 0 24 24" {...svg}><circle cx="12" cy="12" r="9" /><path d="M12 7.5v5M12 16.2v.3" /></svg><span>{error}</span></p> : null}
          <div className="fd-rac fd-pna">
            <button type="button" className="fd-btn" onClick={save}>Save</button>
            <button type="button" className="fd-btn is-plain" onClick={p.onCancel}>Cancel</button>
          </div>
        </div>
      ) : (
        <div className="fd-sheet">
          {hasBusinessHeader(b) ? (
            <div className="fd-dch">
              <BrandLogo url={b.logo} initials={b.init} hideWhenEmpty />
              <div>
                {b.name ? <p className="fd-dcb">{b.name}</p> : null}
                {b.addr ? <p className="fd-dcs">{b.addr}</p> : null}
                {joinParts([b.phone, b.email]) ? <p className="fd-dcs">{joinParts([b.phone, b.email])}</p> : null}
                {joinParts([b.site, b.hours]) ? <p className="fd-dcs">{joinParts([b.site, b.hours])}</p> : null}
              </div>
            </div>
          ) : null}
          <p className="fd-dcn"><span><span className="fd-h">Quote</span></span><StatusChip quote={q} plain /></p>
          <p className="fd-dcs">{q.service}</p>
          <p className="fd-dcl">Quote for</p>
          <p className="fd-dcv">{q.name}</p>
          <ul className="fd-qln">
            {q.file ? (
              <li className="is-line fd-qfl">
                <svg width={16} height={16} viewBox="0 0 24 24" {...svg}><path d="M19 11.5 12 18.5a4.2 4.2 0 0 1-6-6l7.5-7.5a2.8 2.8 0 0 1 4 4L10 16.5a1.4 1.4 0 0 1-2-2l6.5-6.5" /></svg>
                <span>{`Your own quote: ${q.file}`}</span>
                <button type="button" className="fd-link" onClick={p.onRemoveFile}>Remove</button>
              </li>
            ) : null}
            {shownLines.map((line, k) => (
              <li className="is-line" key={k}><span>{line.text}</span><b>{range ? amountLabel(q) : formatMoney(line.amount)}</b></li>
            ))}
            <li className="is-tot"><span>Total</span><b>{amountLabel(q)}</b></li>
          </ul>
          <p className="fd-dcs">Accept online with the link in this message.</p>
        </div>
      )}

      <div className="fd-rac fd-pna fd-docact">
        {canApprove(q) && !p.editing ? <button type="button" className="fd-btn is-fill" onClick={p.onApprove}>Approve and send</button> : null}
      </div>
    </section>
  );
}
