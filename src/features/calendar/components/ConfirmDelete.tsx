"use client";

import { useEffect, useRef, type KeyboardEvent, type RefObject } from "react";
import { confirmSafeButton, type CalendarViewModel } from "../api/view";

// Delete asks first. The safe choice, Reschedule, is the filled button; Delete is red. A small local
// dialog (the shell has no confirm dialog yet). On open the cursor goes to the safe button (Reschedule
// instead, else Cancel); Escape works like Cancel; on close the cursor goes back to the Delete button
// that opened it, or to the Undo line when the stop was deleted.
export function ConfirmDelete({ confirm, onReschedule, onYes, onNo, undoRef }: {
  confirm: CalendarViewModel["confirm"];
  onReschedule: () => void;
  onYes: () => void;
  onNo: () => void;
  undoRef?: RefObject<HTMLButtonElement | null>;
}) {
  const rescheduleRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const deleted = useRef(false);
  const safe = confirmSafeButton(confirm);

  useEffect(() => {
    if (confirm.open) {
      deleted.current = false;
      opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      (safe === "reschedule" ? rescheduleRef : cancelRef).current?.focus();
      return;
    }
    const back = deleted.current ? undoRef?.current : opener.current;
    opener.current = null;
    if (back && back.isConnected) back.focus();
    // `safe` is read only at the moment the question opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confirm.open]);

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape" && confirm.open) {
      e.preventDefault();
      onNo();
    }
  };
  const yes = () => {
    deleted.current = true;
    onYes();
  };

  return (
    <div className={`fd-cf${confirm.open ? "" : " is-off"}`} role="alertdialog" aria-modal="true" aria-labelledby="fd-cf-t" aria-hidden={!confirm.open} onKeyDown={onKey}>
      <div className="fd-cfb">
        <h3 className="fd-cft" id="fd-cf-t">{confirm.title}</h3>
        <p className="fd-cfp">{confirm.body}</p>
        <div className="fd-cfa">
          <button ref={rescheduleRef} type="button" className={`fd-btn is-fill${confirm.canReschedule ? "" : " is-off"}`} onClick={onReschedule}>Reschedule instead</button>
          <button type="button" className="fd-btn is-danger" onClick={yes}>{confirm.yesText}</button>
          <button ref={cancelRef} type="button" className="fd-btn is-plain" onClick={onNo}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
