"use client";

import { useEffect, useRef, useState } from "react";
import { useDialog } from "../hooks/use-dialog";
import { sheetOnTop } from "../api/gestures";

// Send feedback. There is no backend yet, so the note field and Send stay disabled and the sheet says
// so; the thank-you markup is kept for when one exists and cannot be reached now.
// While open: focus moves to Cancel, Tab stays inside, Escape closes, focus goes back to the opener.
// Every opening starts on the form (design `openFb`: fbView 'form'). A page sheet open on top takes
// Escape first (design `uxEsc`). Without a first name the thank-you reads "Thanks.".
export function FeedbackSheet({ open, first, onClose }: { open: boolean; first: string; onClose: () => void }) {
  const [sent, setSent] = useState(false);
  const [note, setNote] = useState("");
  const [wasOpen, setWasOpen] = useState(open);
  if (wasOpen !== open) {
    setWasOpen(open);
    if (open) {
      setSent(false);
      setNote("");
    }
  }
  const box = useRef<HTMLElement>(null);
  const cancelButton = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const close = () => {
    onClose();
    setSent(false);
  };
  useDialog(box, close, open, { yieldTo: () => sheetOnTop(box.current) });
  useEffect(() => {
    if (!open) return;
    const id = setTimeout(() => cancelButton.current?.focus(), 80);
    return () => clearTimeout(id);
  }, [open]);
  const send = () => {
    setSent(true);
    setNote("");
    setTimeout(() => closeButton.current?.focus(), 0);
  };
  return (
    <section ref={box} className={`fd-fb${open ? " is-open" : ""}`} role="dialog" aria-modal={open ? true : undefined} aria-labelledby="fd-fb-h" aria-hidden={!open}>
      <div className={`fd-part${sent ? " is-off" : ""}`}>
        <h2 className="fd-fbt" id="fd-fb-h">Send feedback</h2>
        <p className="fd-fbs">Sending feedback is not available yet.</p>
        <textarea id="fd-fb-text" name="feedback" className="fd-fbi" rows={4} aria-label="Your feedback" value={note} disabled onChange={(event) => setNote(event.target.value)} />
        <div className="fd-fbb">
          <button type="button" ref={cancelButton} className="fd-btn is-plain" onClick={close}>Cancel</button>
          <button type="button" className="fd-btn is-fill" disabled title="Not available yet" onClick={send}>Send</button>
        </div>
      </div>
      <div className={`fd-part${sent ? " is-new" : " is-off"}`}>
        <h2 className="fd-fbt">{first ? `Thanks, ${first}.` : "Thanks."}</h2>
        <p className="fd-fbk">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
          Sent. We read every note.
        </p>
        <div className="fd-fbb"><button type="button" ref={closeButton} className="fd-btn is-plain" onClick={close}>Close</button></div>
      </div>
    </section>
  );
}
