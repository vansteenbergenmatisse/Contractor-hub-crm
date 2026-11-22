"use client";

import { useEffect, useRef } from "react";
import { useDialog } from "../hooks/use-dialog";
import { REASONS, type Reason, type ReasonRequest } from "../types";

// The reason sheet: the trash icon on a Pipeline card and Lost on a quote open it.
// "Ask again later" answers "later"; the other four answer their own words.
// Escape is Cancel, Tab stays in the sheet, and on close focus goes back to the button that opened it.
export function ReasonDialog({ request, onClose }: { request: ReasonRequest | null; onClose: () => void }) {
  if (!request) return null;
  return <ReasonSheet request={request} onClose={onClose} />;
}

function ReasonSheet({ request, onClose }: { request: ReasonRequest; onClose: () => void }) {
  const first = useRef<HTMLButtonElement>(null);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const id = setTimeout(() => first.current?.focus(), 80);
    return () => clearTimeout(id);
  }, [request]);
  useDialog(box, onClose);
  const pick = (reason: Reason) => {
    onClose();
    request.onPick(reason);
  };
  return (
    <div ref={box} className="fd-cf fd-dg" role="alertdialog" aria-modal="true" aria-labelledby="fd-dg-t">
      <div className="fd-cfb">
        <h3 className="fd-cft" id="fd-dg-t">{`Take ${request.name} off the board?`}</h3>
        <p className="fd-cfp">Pick what happened.</p>
        <div className="fd-cfa">
          {REASONS.map((text, index) => (
            <button
              key={text}
              type="button"
              ref={index === 0 ? first : undefined}
              className={`fd-btn ${index === 0 ? "is-fill" : "is-plain"}`}
              onClick={() => pick(index === 0 ? "later" : (text as Reason))}
            >
              {text}
            </button>
          ))}
          <button type="button" className="fd-btn is-plain" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
