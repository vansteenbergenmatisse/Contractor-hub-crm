"use client";

import { useRowGestures } from "@/features/app-shell";
import { amountLabel, canApprove, checkBuild, initialsOf, isVisible } from "../api/quotes";
import { quoteRowActions } from "../api/row-actions";
import type { BuildDraft, Quote, QuoteFilter } from "../types";
import { StatusChip } from "./StatusChip";

const errIcon = { width: 16, height: 16, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true, focusable: "false" } as const;

export type QuoteRowProps = {
  quote: Quote;
  filter: QuoteFilter;
  selected: boolean;
  filled: boolean;
  canUndo: boolean;
  // What the owner typed in the Build quote fields (kept state, so it survives a page change).
  draft: BuildDraft;
  onDraft: (change: Partial<BuildDraft>) => void;
  onSee: () => void;
  onApprove: () => void;
  onWon: () => void;
  onLost: () => void;
  onUndo: () => void;
  onBuild: (service: string, priceRaw: string) => void;
  onUpload: () => void;
};

export function QuoteRow(p: QuoteRowProps) {
  const q = p.quote;
  const { service, price, errors } = p.draft;
  const sv = `fd-qt-sv-${q.id}`, pr = `fd-qt-pr-${q.id}`;

  const build = () => {
    const check = checkBuild(service, price);
    if (!check.ok) {
      p.onDraft({ errors: check.errors });
      document.getElementById(check.field === "service" ? sv : pr)?.focus();
      return;
    }
    p.onDraft({ errors: { service: "", price: "" } });
    p.onBuild(check.service, price);
  };
  const gestures = useRowGestures<HTMLDivElement>({ label: q.name, actions: quoteRowActions(q, { ...p, onBuild: build }), disabled: !isVisible(q, p.filter) });

  return (
    <div {...gestures} className={"fd-rw" + (isVisible(q, p.filter) ? "" : " is-off") + (p.selected ? " is-sel" : "")} id={`fd-qt-${q.id}`} data-row-id={`quote-${q.id}`} tabIndex={0}>
      <div className="fd-rm">
        <span className="fd-av" aria-hidden="true">{initialsOf(q.name)}</span>
        <div className="fd-rbx">
          <p className="fd-rn">{q.name}</p>
          <p className="fd-rsb">{q.service}</p>
          <div className="fd-rtg">
            <StatusChip quote={q} />
            {p.canUndo ? <button type="button" className="fd-link" onClick={p.onUndo}>Undo</button> : null}
          </div>
        </div>
      </div>
      <div className="fd-rac">
        <span className="fd-ram">{amountLabel(q)}</span>
        <button type="button" className="fd-btn is-plain" id={`fd-qt-v-${q.id}`} onClick={p.onSee} aria-label={`See the quote for ${q.name}`}>See the quote</button>
        {canApprove(q) ? (
          <button type="button" className={"fd-btn" + (p.filled ? " is-fill" : "")} onClick={p.onApprove} aria-label={`Approve and send the quote to ${q.name}`}>Approve and send</button>
        ) : null}
        {q.status === "sent" ? (
          <>
            <button type="button" className="fd-btn is-plain" onClick={p.onWon} aria-label={`${q.name} accepted`}>Accepted</button>
            <button type="button" className="fd-btn is-plain" onClick={p.onLost} aria-label={`${q.name} lost`}>Lost</button>
          </>
        ) : null}
      </div>
      {q.status === "need" ? (
        <div className="fd-rex fd-ivn">
          <div className="fd-ivf">
            <label className="fd-ll" htmlFor={sv}>Service</label>
            <input className="fd-lin" id={sv} type="text" autoComplete="off" value={service} onChange={(e) => p.onDraft({ service: e.target.value })}
              aria-invalid={errors.service ? true : undefined} aria-describedby={errors.service ? `${sv}-e` : undefined} />
            {errors.service ? <p className="fd-lerr" id={`${sv}-e`} role="alert"><svg {...errIcon}><circle cx="12" cy="12" r="9" /><path d="M12 7.5v5M12 16.2v.3" /></svg><span>{errors.service}</span></p> : null}
          </div>
          <div className="fd-ivf">
            <label className="fd-ll" htmlFor={pr}>Price or price range</label>
            <input className="fd-lin" id={pr} type="text" inputMode="text" autoComplete="off" placeholder="For example 950 or 800 to 1,200" value={price} onChange={(e) => p.onDraft({ price: e.target.value })}
              aria-invalid={errors.price ? true : undefined} aria-describedby={errors.price ? `${pr}-e` : undefined} />
            {errors.price ? <p className="fd-lerr" id={`${pr}-e`} role="alert"><svg {...errIcon}><circle cx="12" cy="12" r="9" /><path d="M12 7.5v5M12 16.2v.3" /></svg><span>{errors.price}</span></p> : null}
          </div>
          <button type="button" className="fd-btn" onClick={build}>Build quote</button>
          <button type="button" className="fd-link fd-qup" onClick={p.onUpload}>Or upload your own quote</button>
        </div>
      ) : null}
    </div>
  );
}
