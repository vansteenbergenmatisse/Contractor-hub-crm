"use client";

import { useEffect, useRef, type KeyboardEvent } from "react";
import type { FormErrors, FormField, FormValues, LeadsState } from "../types";
import { ChannelIcon } from "./ChannelIcon";

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
};

function FieldError({ id, message }: { id: string; message: string }) {
  return (
    <p className={`fd-lerr${message ? "" : " is-off"}`} id={id} role="alert">
      <ChannelIcon name="alert" size={16} />
      <span>{message}</span>
    </p>
  );
}

// "Add a lead by hand": a bottom sheet on a phone, a panel beside the list on a computer.
// Phase 2: it only adds a row on screen. In Phase 3 it posts to the form webhook so the
// lead-capture workflow in HighLevel runs.
export function AddLeadPanel({ sheet, phone, focusTick, form, errors, focus, onField, onSubmit, onClose }: Props) {
  const nameRef = useRef<HTMLInputElement | null>(null);
  const phoneRef = useRef<HTMLInputElement | null>(null);
  const emailRef = useRef<HTMLInputElement | null>(null);

  // A failed submit moves the cursor to the first wrong field.
  useEffect(() => {
    if (focus) ({ name: nameRef, phone: phoneRef, email: emailRef })[focus.field].current?.focus();
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
  const onKey = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key === "Escape" && sheet) onClose();
  };
  const bad = (m: string) => (m ? " is-bad" : "");

  return (
    <>
      <button type="button" className={`fx-addscrim${sheet ? " is-on" : ""}`} aria-label="Close" tabIndex={sheet ? 0 : -1} onClick={onClose} />
      <section className={`fd-pnl fx-addp${sheet ? " is-sheet" : ""}`} aria-labelledby="fd-ld-h" role={dialog ? "dialog" : undefined} aria-modal={dialog ? true : undefined} onKeyDown={onKey}>
        <h2 className="fd-pnh" id="fd-ld-h">Add a lead by hand</h2>
        <p className="fd-pns">For a lead you met in person. Leads from calls, forms and messages add themselves.</p>
        <label className="fd-ll" htmlFor="fd-ld-name">Name</label>
        <input className={`fd-lin${bad(errors.name)}`} id="fd-ld-name" type="text" autoComplete="off" ref={nameRef} value={form.name} aria-invalid={errors.name ? true : undefined} aria-describedby="fd-ld-name-e" onChange={(e) => onField("name", e.target.value)} />
        <FieldError id="fd-ld-name-e" message={errors.name} />
        <label className="fd-ll" htmlFor="fd-ld-phone">Phone</label>
        <input className={`fd-lin${bad(errors.phone)}`} id="fd-ld-phone" type="tel" inputMode="tel" autoComplete="off" ref={phoneRef} value={form.phone} aria-invalid={errors.phone ? true : undefined} aria-describedby="fd-ld-phone-e" onChange={(e) => onField("phone", e.target.value)} />
        <FieldError id="fd-ld-phone-e" message={errors.phone} />
        <label className="fd-ll" htmlFor="fd-ld-email">Email (if they have one)</label>
        <input className={`fd-lin${bad(errors.email)}`} id="fd-ld-email" type="email" inputMode="email" autoComplete="off" ref={emailRef} value={form.email} aria-invalid={errors.email ? true : undefined} aria-describedby="fd-ld-email-e" onChange={(e) => onField("email", e.target.value)} />
        <FieldError id="fd-ld-email-e" message={errors.email} />
        <label className="fd-ll" htmlFor="fd-ld-addr">Full address (if you have it)</label>
        <input className="fd-lin" id="fd-ld-addr" type="text" autoComplete="off" value={form.addr} onChange={(e) => onField("addr", e.target.value)} />
        <label className="fd-ll" htmlFor="fd-ld-need">What they need (optional)</label>
        <input className="fd-lin" id="fd-ld-need" type="text" autoComplete="off" value={form.need} onChange={(e) => onField("need", e.target.value)} />
        <div className="fx-addact">
          <button type="button" className="fd-btn fd-lgo" onClick={onSubmit}>Add lead</button>
          <button type="button" className="fd-btn is-plain fd-lgo fx-addx" onClick={onClose}>Cancel</button>
        </div>
      </section>
    </>
  );
}
