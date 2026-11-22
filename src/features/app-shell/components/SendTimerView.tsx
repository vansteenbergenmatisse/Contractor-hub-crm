"use client";

import type { RefObject } from "react";
import { BrandLogo } from "@/shared/ui/brand-logo";
import type { SendDialogHandlers, TimerState } from "../api/send-timer";
import type { Business, SendTimerRequest } from "../types";

// The dialog as plain markup from its state; no hooks, so a test can read the tree and press the buttons.
// Without a logo and a business name the document has no business block (a missing value shows nothing).
export function SendTimerView({ request, business, state, handlers, actionRef, dialogRef }: {
  request: SendTimerRequest;
  business: Business;
  state: TimerState;
  handlers: SendDialogHandlers;
  actionRef?: RefObject<HTMLButtonElement | null>;
  dialogRef?: RefObject<HTMLDivElement | null>;
}) {
  const view = state.viewing;
  const { doc } = request;
  return (
    <div ref={dialogRef} className={`fd-cf fd-dg${view ? " is-view" : ""}`} role="alertdialog" aria-modal="true" aria-labelledby="fd-dg-t">
      <div className="fd-cfb">
        <button type="button" className={`fd-link fd-aback${view ? "" : " is-off"}`} onClick={handlers.onBack}>
          <svg className="fd-flip" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d="m9 6 6 6-6 6" /></svg>
          <span>Back</span>
        </button>
        <h3 className="fd-cft" id="fd-dg-t">{`Sending to ${request.name}`}</h3>
        <p className={`fd-pt fd-dgn${view ? " is-off" : ""}`} aria-hidden="true">{String(state.n)}</p>
        <p className={`fd-cfp${view ? " is-off" : ""}`} aria-live="polite">{`${request.kind} · ${request.total} · goes out at 0.`}</p>
        <div className={`fd-sheet fd-dgv${view ? "" : " is-off"}`}>
          {business.logoUrl || business.name ? (
            <div className="fd-dch">
              <BrandLogo url={business.logoUrl} initials={business.init} />
              {business.name ? <div><p className="fd-dcb">{business.name}</p></div> : null}
            </div>
          ) : null}
          <p className="fd-dcn"><span>{doc.title}</span></p>
          <p className="fd-dcv">{doc.name}</p>
          <p className="fd-dcs">{doc.sub}</p>
          <ul className="fd-qln">
            {doc.file ? <li className="is-line fd-qfl"><span>{`Your own quote: ${doc.file}`}</span></li> : null}
            {doc.lines.slice(0, 3).map(([text, amount], index) => (
              <li key={`${index}-${text}`} className="is-line"><span>{text}</span><b>{amount}</b></li>
            ))}
            <li className="is-tot"><span>Total</span><b>{doc.amount}</b></li>
          </ul>
        </div>
        <div className={`fd-cfa${view ? " is-off" : ""}`}>
          <button type="button" ref={actionRef} className="fd-btn is-fill" onClick={handlers.onCancel}>Cancel</button>
          <button type="button" className="fd-btn is-plain" onClick={handlers.onView}>{`View ${request.kind.toLowerCase()}`}</button>
        </div>
      </div>
    </div>
  );
}
