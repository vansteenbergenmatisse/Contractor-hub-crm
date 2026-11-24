"use client";

import { useEffect, useRef, type KeyboardEvent } from "react";
import { trapFocus } from "@/features/app-shell";
import type { FormErrors, FormField, FormValues, LeadOrigin, LeadsState } from "../types";
import { LeadForm } from "./LeadForm";

type Props = {
  sheet: boolean;
  // True on a phone (under 1024px): only then is the open sheet a modal dialog.
  phone: boolean;
  // Raised each time "Add a lead" is pressed on a computer: the form scrolls into view and the name
  // field gets the cursor, every time.
  focusTick: number;
  form: FormValues;
  errors: FormErrors;
  focus: LeadsState["focus"];
  onField: (field: FormField, value: string) => void;
  onSubmit: () => void;
  onClose: () => void;
  origin?: LeadOrigin;
  onOrigin?: (origin: LeadOrigin) => void;
};

// "Add a lead by hand": a bottom sheet on a phone, a panel beside the list on a computer.
// Local only: it adds a row on this screen and writes nothing, and the panel says so.
export function AddLeadPanel({ sheet, phone, focusTick, form, errors, focus, onField, onSubmit, onClose, origin, onOrigin }: Props) {
  const panelRef = useRef<HTMLElement | null>(null);
  const nameRef = useRef<HTMLInputElement | null>(null);
  const phoneRef = useRef<HTMLInputElement | null>(null);
  const emailRef = useRef<HTMLInputElement | null>(null);

  // A failed submit moves the cursor to the first wrong field.
  useEffect(() => {
    if (focus && !document.querySelector("[data-new-lead-dialog]")) ({ name: nameRef, phone: phoneRef, email: emailRef })[focus.field].current?.focus();
  }, [focus]);

  // Opening the sheet puts the cursor in the name field.
  useEffect(() => {
    if (sheet) nameRef.current?.focus();
  }, [sheet]);

  // On a computer, "Add a lead" goes to the form that is already there.
  useEffect(() => {
    if (!focusTick) return;
    const el = nameRef.current;
    if (!el) return;
    try { el.scrollIntoView({ block: "center" }); } catch { /* older browsers: focus still moves */ }
    el.focus();
  }, [focusTick]);

  const dialog = sheet && phone;
  // The open sheet closes with Escape wherever the focus is (the page puts it back on "Add a lead").
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });
  useEffect(() => {
    if (!sheet) return;
    const onEscape = (e: globalThis.KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      e.preventDefault();
      close.current();
    };
    document.addEventListener("keydown", onEscape);
    return () => document.removeEventListener("keydown", onEscape);
  }, [sheet]);
  // The phone sheet is a modal dialog: Tab and Shift+Tab stay inside it.
  const onKey = (e: KeyboardEvent<HTMLElement>) => {
    if (dialog) trapFocus(e, panelRef.current);
  };

  return (
    <>
      <button type="button" className={`fx-addscrim${sheet ? " is-on" : ""}`} aria-label="Close" tabIndex={sheet ? 0 : -1} onClick={onClose} />
      <section ref={panelRef} className={`fd-pnl fx-addp${sheet ? " is-sheet" : ""}`} aria-labelledby="fd-ld-h" role={dialog ? "dialog" : undefined} aria-modal={dialog ? true : undefined} onKeyDown={onKey}>
        <h2 className="fd-pnh" id="fd-ld-h">Add a lead by hand</h2>
        <p className="fd-pns">For a lead you met in person. It stays on this screen and is not saved.</p>
        <LeadForm
          idPrefix="fd-ld"
          form={form}
          errors={errors}
          nameRef={nameRef}
          phoneRef={phoneRef}
          emailRef={emailRef}
          origin={origin}
          onOrigin={onOrigin}
          fill={sheet}
          onField={onField}
          onSubmit={onSubmit}
          onCancel={onClose}
        />
      </section>
    </>
  );
}
