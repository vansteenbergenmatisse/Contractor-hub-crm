"use client";

import { useEffect, useRef, useState } from "react";
import { useDialog } from "../hooks/use-dialog";

// Send feedback. Phase 2: the note goes nowhere (no backend yet); the thank-you is real UI only.
// While open: focus moves to the note, Tab stays inside, Escape closes, focus goes back to the
// opener. Send stays off until something is typed.
export function FeedbackSheet({ open, first, onClose }: { open: boolean; first: string; onClose: () => void }) {
  const [sent, setSent] = useState(false);
  const [note, setNote] = useState("");
  const box = useRef<HTMLElement>(null);
  const field = useRef<HTMLTextAreaElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const close = () => {
    onClose();
    setSent(false);
  };
  useDialog(box, close, open);
  useEffect(() => {
    if (!open) return;
    const id = setTimeout(() => field.current?.focus(), 80);
    return () => clearTimeout(id);
  }, [open]);
  const send = () => {
    if (!note.trim()) return;
    setSent(true);
    setNote("");
    setTimeout(() => closeButton.current?.focus(), 0);
  };
  return (
    <section ref={box} className={`fd-fb${open ? " is-open" : ""}`} role="dialog" aria-modal={open ? true : undefined} aria-labelledby="fd-fb-h" aria-hidden={!open}>
      <div className={`fd-part${sent ? " is-off" : ""}`}>
        <h2 className="fd-fbt" id="fd-fb-h">Send feedback</h2>
        <p className="fd-fbs">What should we fix or add? It goes straight to our team.</p>
        <textarea ref={field} id="fd-fb-text" name="feedback" className="fd-fbi" rows={4} aria-label="Your feedback" placeholder="Type it here" value={note} onChange={(event) => setNote(event.target.value)} />
        <div className="fd-fbb">
          <button type="button" className="fd-btn is-plain" onClick={close}>Cancel</button>
          <button type="button" className="fd-btn is-fill" disabled={!note.trim()} onClick={send}>Send</button>
        </div>
      </div>
      <div className={`fd-part${sent ? " is-new" : " is-off"}`}>
        <h2 className="fd-fbt">Thanks, {first}.</h2>
        <p className="fd-fbk">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
          Sent. We read every note.
        </p>
        <div className="fd-fbb"><button type="button" ref={closeButton} className="fd-btn is-plain" onClick={close}>Close</button></div>
      </div>
    </section>
  );
}
