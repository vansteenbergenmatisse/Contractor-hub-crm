"use client";

import type { RefObject } from "react";
import { ORIGIN_CHOICES, ORIGIN_LABEL } from "../api/lead-sources";
import type { FormErrors, FormField, FormValues, LeadOrigin } from "../types";
import { FieldError } from "./FieldError";

type Props = {
  idPrefix: string;
  form: FormValues;
  errors: FormErrors;
  nameRef: RefObject<HTMLInputElement | null>;
  phoneRef: RefObject<HTMLInputElement | null>;
  emailRef: RefObject<HTMLInputElement | null>;
  origin?: LeadOrigin;
  onOrigin?: (origin: LeadOrigin) => void;
  // True: "where the lead came from" is the first field.
  originFirst?: boolean;
  fill?: boolean;
  onField: (field: FormField, value: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
};

const bad = (message: string) => (message ? " is-bad" : "");

// The one lead form, used by the New lead dialog and by "Add a lead by hand".
export function LeadForm({ idPrefix: p, form, errors, nameRef, phoneRef, emailRef, origin, onOrigin, originFirst, fill, onField, onSubmit, onCancel }: Props) {
  const source = onOrigin ? (
    <>
      <label className="fd-ll" htmlFor={`${p}-source`}>Where the lead came from</label>
      <select className="fd-lin" id={`${p}-source`} value={origin} onChange={(e) => onOrigin(e.target.value as LeadOrigin)}>
        {ORIGIN_CHOICES.map((key) => <option key={key} value={key}>{ORIGIN_LABEL[key]}</option>)}
      </select>
    </>
  ) : null;
  return (
    <form noValidate style={{ display: "contents" }} onSubmit={(e) => { e.preventDefault(); onSubmit(); }}>
      {originFirst ? source : null}
      <label className="fd-ll" htmlFor={`${p}-name`}>Name</label>
      <input className={`fd-lin${bad(errors.name)}`} id={`${p}-name`} type="text" autoCapitalize="words" autoComplete="off" ref={nameRef} value={form.name} aria-invalid={errors.name ? true : undefined} aria-describedby={`${p}-name-e`} onChange={(e) => onField("name", e.target.value)} />
      <FieldError id={`${p}-name-e`} message={errors.name} />
      <label className="fd-ll" htmlFor={`${p}-phone`}>Phone</label>
      <input className={`fd-lin${bad(errors.phone)}`} id={`${p}-phone`} type="tel" inputMode="tel" autoComplete="off" ref={phoneRef} value={form.phone} aria-invalid={errors.phone ? true : undefined} aria-describedby={`${p}-phone-e`} onChange={(e) => onField("phone", e.target.value)} />
      <FieldError id={`${p}-phone-e`} message={errors.phone} />
      <label className="fd-ll" htmlFor={`${p}-email`}>Email (optional)</label>
      <input className={`fd-lin${bad(errors.email)}`} id={`${p}-email`} type="email" inputMode="email" autoComplete="off" ref={emailRef} value={form.email} aria-invalid={errors.email ? true : undefined} aria-describedby={`${p}-email-e`} onChange={(e) => onField("email", e.target.value)} />
      <FieldError id={`${p}-email-e`} message={errors.email} />
      <label className="fd-ll" htmlFor={`${p}-addr`}>Address (optional)</label>
      <input className="fd-lin" id={`${p}-addr`} type="text" autoCapitalize="words" autoComplete="off" value={form.addr} onChange={(e) => onField("addr", e.target.value)} />
      <label className="fd-ll" htmlFor={`${p}-need`}>What they need (optional)</label>
      <input className="fd-lin" id={`${p}-need`} type="text" enterKeyHint="done" autoComplete="off" value={form.need} onChange={(e) => onField("need", e.target.value)} />
      {originFirst ? null : source}
      <div className="fx-addact">
        <button type="submit" className={`fd-btn fd-lgo${fill ? " is-fill" : ""}`} >Add lead</button>
        <button type="button" className="fd-btn is-plain fd-lgo fx-addx" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}
