"use client";

import { useEffect, useRef, type RefObject } from "react";
import { trapTab } from "@/features/app-shell";
import { confirmSafeButton, type CalendarViewModel } from "../api/view";

// Delete asks first. The safe choice, Reschedule, is the filled button; Delete is red. A small local
// dialog (the shell has no confirm dialog yet). On open the cursor goes to the safe button (Reschedule
// instead, else Cancel); Tab stays inside the dialog; Escape works like Cancel; on close the cursor goes
// back to the Delete button that opened it, or to the Undo line when the stop was deleted.
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
  const box = useRef<HTMLDivElement>(null);
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

  // While open, on the whole document (so it works wherever focus is): Escape cancels, Tab cycles
  // through the dialog's shown buttons.
  useEffect(() => {
    if (!confirm.open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onNo();
        return;
      }
      if (e.key !== "Tab" || !box.current) return;
      const items = Array.from(box.current.querySelectorAll<HTMLButtonElement>("button")).filter((b) => !b.classList.contains("is-off") && !b.disabled);
      const next = trapTab(items.indexOf(document.activeElement as HTMLButtonElement), items.length, e.shiftKey);
      if (next === null) return;
      e.preventDefault();
      items[next].focus();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [confirm.open, onNo]);
  const yes = () => {
    deleted.current = true;
    onYes();
  };

  return (
    <div className={`fd-cf${confirm.open ? "" : " is-off"}`} role="alertdialog" aria-modal="true" aria-labelledby="fd-cf-t" aria-hidden={!confirm.open}>
      <div className="fd-cfb" ref={box}>
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
