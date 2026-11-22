"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { createSendController, sendDialogHandlers, type SendController, type SendDialogHandlers, type TimerState } from "../api/send-timer";
import type { Business, SendTimerRequest } from "../types";
import { BrandLogo } from "./BrandLogo";
import { useBusiness } from "./ShellContext";

// Every press that sends a quote or an invoice opens this. It counts 20 to 0 and then runs onDone.
// Cancel sends nothing. "View" shows the document and pauses the count; Back goes on.
// Phase 2: nothing leaves this app. The server hold arrives in Phase 3.
// Mount it with a new `key` for every send, so each one starts a fresh count.
// Every decision lives in `createSendController` (api/send-timer.ts); this file only draws it.
// `request` and `onClose` are read once, when the dialog mounts.
export function SendTimerDialog({ request, onClose, tickMs = 1000 }: { request: SendTimerRequest; onClose: () => void; tickMs?: number }) {
  const business = useBusiness();
  const actionRef = useRef<HTMLButtonElement>(null);
  const [timer, setTimer] = useState<TimerState | null>(null);
  const [setup] = useState(() => {
    const waits = new Set<ReturnType<typeof setTimeout>>();
    const controller: SendController = createSendController({
      onDone: request.onDone,
      onClose,
      onChange: setTimer,
      schedule: (fn, ms) => {
        const id = setTimeout(() => { waits.delete(id); fn(); }, ms);
        waits.add(id);
        return () => { clearTimeout(id); waits.delete(id); };
      },
    });
    return { controller, waits, handlers: sendDialogHandlers(controller) };
  });

  useEffect(() => {
    const id = setTimeout(() => actionRef.current?.focus(), 80);
    return () => clearTimeout(id);
  }, []);

  useEffect(() => {
    const { controller, waits } = setup;
    const id = setInterval(() => controller.tick(), tickMs);
    return () => {
      clearInterval(id);
      for (const wait of waits) clearTimeout(wait);
      waits.clear();
    };
  }, [setup, tickMs]);

  const state = timer ?? setup.controller.state();
  const handlers: SendDialogHandlers = {
    ...setup.handlers,
    // Back puts focus on Cancel again, like the design.
    onBack: () => { setup.handlers.onBack(); setTimeout(() => actionRef.current?.focus(), 80); },
  };
  return <SendTimerView request={request} business={business} state={state} handlers={handlers} actionRef={actionRef} />;
}

// The dialog as plain markup from its state; no hooks, so a test can read the tree and press the buttons.
export function SendTimerView({ request, business, state, handlers, actionRef }: {
  request: SendTimerRequest;
  business: Business;
  state: TimerState;
  handlers: SendDialogHandlers;
  actionRef?: RefObject<HTMLButtonElement | null>;
}) {
  const view = state.viewing;
  const { doc } = request;
  return (
    <div className={`fd-cf fd-dg${view ? " is-view" : ""}`} role="alertdialog" aria-modal="true" aria-labelledby="fd-dg-t">
      <div className="fd-cfb">
        <button type="button" className={`fd-link fd-aback${view ? "" : " is-off"}`} onClick={handlers.onBack}>
          <svg className="fd-flip" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d="m9 6 6 6-6 6" /></svg>
          <span>Back</span>
        </button>
        <h3 className="fd-cft" id="fd-dg-t">{`Sending to ${request.name}`}</h3>
        <p className={`fd-pt fd-dgn${view ? " is-off" : ""}`} aria-hidden="true">{String(state.n)}</p>
        <p className={`fd-cfp${view ? " is-off" : ""}`} aria-live="polite">{`${request.kind} · ${request.total} · goes out at 0.`}</p>
        <div className={`fd-sheet fd-dgv${view ? "" : " is-off"}`}>
          <div className="fd-dch">
            <BrandLogo url={business.logoUrl} initials={business.init} />
            <div><p className="fd-dcb">{business.name}</p></div>
          </div>
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
