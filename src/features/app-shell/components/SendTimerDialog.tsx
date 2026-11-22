"use client";

import { useEffect, useRef, useState } from "react";
import { markFired, setViewing, shouldFire, startTimer, tick, type TimerState } from "../api/send-timer";
import type { SendTimerRequest } from "../types";

// Every press that sends a quote or an invoice opens this. It counts 20 to 0 and then runs onDone.
// Cancel sends nothing. "View" shows the document and pauses the count; Back goes on.
// Phase 2: nothing leaves this app. The server hold arrives in Phase 3.
// Mount it with a new `key` for every send, so each one starts a fresh count.
export function SendTimerDialog({ request, onClose, tickMs = 1000 }: { request: SendTimerRequest; onClose: () => void; tickMs?: number }) {
  const [timer, setTimer] = useState<TimerState>(startTimer);
  const doneRef = useRef<(() => void) | undefined>(request.onDone);
  const actionRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const id = setTimeout(() => actionRef.current?.focus(), 80);
    return () => clearTimeout(id);
  }, []);

  useEffect(() => {
    const id = setInterval(() => setTimer((t) => tick(t)), tickMs);
    return () => clearInterval(id);
  }, [tickMs]);

  useEffect(() => {
    if (!shouldFire(timer)) return;
    const wait = setTimeout(() => {
      setTimer((t) => {
        if (!shouldFire(t)) return t;
        const done = doneRef.current;
        doneRef.current = undefined;
        queueMicrotask(() => {
          onClose();
          done?.();
        });
        return markFired(t);
      });
    }, 300);
    return () => clearTimeout(wait);
  }, [timer, onClose]);

  const view = timer.viewing;
  const { doc } = request;
  return (
    <div className={`fd-cf fd-dg${view ? " is-view" : ""}`} role="alertdialog" aria-modal="true" aria-labelledby="fd-dg-t">
      <div className="fd-cfb">
        <button type="button" className={`fd-link fd-aback${view ? "" : " is-off"}`} onClick={() => setTimer((t) => setViewing(t, false))}>
          <svg className="fd-flip" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d="m9 6 6 6-6 6" /></svg>
          <span>Back</span>
        </button>
        <h3 className="fd-cft" id="fd-dg-t">{`Sending to ${request.name}`}</h3>
        <p className={`fd-pt fd-dgn${view ? " is-off" : ""}`} aria-hidden="true">{String(timer.n)}</p>
        <p className={`fd-cfp${view ? " is-off" : ""}`} aria-live="polite">{`${request.kind} · ${request.total} · goes out at 0.`}</p>
        <div className={`fd-sheet fd-dgv${view ? "" : " is-off"}`}>
          <p className="fd-dcn"><span>{doc.title}</span></p>
          <p className="fd-dcv">{doc.name}</p>
          <p className="fd-dcs">{doc.sub}</p>
          <ul className="fd-qln">
            {doc.file ? <li className="is-line fd-qfl"><span>{`Your own quote: ${doc.file}`}</span></li> : null}
            {doc.lines.slice(0, 3).map(([text, amount]) => (
              <li key={text} className="is-line"><span>{text}</span><b>{amount}</b></li>
            ))}
            <li className="is-tot"><span>Total</span><b>{doc.amount}</b></li>
          </ul>
        </div>
        <div className={`fd-cfa${view ? " is-off" : ""}`}>
          <button type="button" ref={actionRef} className="fd-btn is-fill" onClick={onClose}>Cancel</button>
          <button type="button" className="fd-btn is-plain" onClick={() => setTimer((t) => setViewing(t, true))}>{`View ${request.kind.toLowerCase()}`}</button>
        </div>
      </div>
    </div>
  );
}
