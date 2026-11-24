"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { PAGE_PATH, useDialog, useKeptReducer } from "@/features/app-shell";
import { NEW_LEAD_EVENT } from "@/shared/lib/new-lead-event";
import { NO_FORM_ACCESS, type LeadFormAccess } from "../api/form-access";
import { DEFAULT_ORIGIN } from "../api/lead-sources";
import { createInitialState, leadsReducer } from "../api/leads-logic";
import { usePublishLeadFormAccess } from "../hooks/use-lead-form-access";
import { useLeadSubmit } from "../hooks/use-lead-submit";
import type { Lead, LeadOrigin } from "../types";
import { LeadForm } from "./LeadForm";

const NO_LEADS: readonly Lead[] = [];
// Above the phone tab bar, inside the page gutter.
const NOTICE: CSSProperties = { position: "fixed", left: 16, right: 16, bottom: "calc(96px + env(safe-area-inset-bottom, 0px))", zIndex: 45, maxWidth: 420, margin: "0 auto", display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 };

// The New lead form over any page. It shares the Leads page's kept state, so a draft and a lead that
// stays on screen are the same on both. It saves only when the server says this person may.
export function NewLeadDialog({ access = NO_FORM_ACCESS }: { access?: LeadFormAccess }) {
  usePublishLeadFormAccess(access);
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [added, setAdded] = useState<"local" | "saved" | null>(null);
  useEffect(() => {
    const onRequest = (event: Event) => {
      event.preventDefault();
      setAdded(null);
      setOpen(true);
    };
    window.addEventListener(NEW_LEAD_EVENT, onRequest);
    return () => window.removeEventListener(NEW_LEAD_EVENT, onRequest);
  }, []);
  if (open) return <OpenDialog access={access} onClose={() => setOpen(false)} onAdded={() => { setOpen(false); setAdded("local"); }} onSaved={() => { setOpen(false); setAdded("saved"); router.refresh(); }} />;
  if (!added) return null;
  const notice = (
    <div className="fd-pnl" role="status" style={NOTICE}>
      <p className="fd-pns" style={{ flex: "1 1 100%", margin: 0 }}>{added === "saved" ? "Lead saved to your CRM." : "Lead added to your Leads screen. It is not saved."}</p>
      <Link className="fd-btn is-plain" href={PAGE_PATH.leads} onClick={() => setAdded(null)}>Open Leads</Link>
      <button type="button" className="fd-btn is-plain" onClick={() => setAdded(null)}>Dismiss</button>
    </div>
  );
  const host = document.querySelector(".fd-app");
  return host ? createPortal(notice, host) : notice;
}

function OpenDialog({ access, onClose, onAdded, onSaved }: { access: LeadFormAccess; onClose: () => void; onAdded: () => void; onSaved: () => void }) {
  const [state, dispatch] = useKeptReducer("leads", leadsReducer, NO_LEADS, createInitialState);
  const [origin, setOrigin] = useState<LeadOrigin>(DEFAULT_ORIGIN);
  const box = useRef<HTMLDivElement | null>(null);
  const name = useRef<HTMLInputElement | null>(null);
  const phone = useRef<HTMLInputElement | null>(null);
  const email = useRef<HTMLInputElement | null>(null);
  const saver = useLeadSubmit({ canSave: access.canSave, form: state.form, origin, dispatch, onLocal: onAdded, onSaved });
  // A save on its way cannot be left: its answer is the only proof of what happened.
  const pending = saver.pending;
  const close = useCallback(() => {
    if (pending) return;
    dispatch({ type: "closeAdd" });
    onClose();
  }, [dispatch, onClose, pending]);
  // An open address list takes Escape first, so Escape closes the list and not the dialog.
  useDialog(box, close, true, { yieldTo: () => !!box.current?.querySelector("[data-address-open]") });
  useEffect(() => {
    name.current?.focus();
  }, []);
  useEffect(() => {
    if (state.focus) ({ name, phone, email })[state.focus.field].current?.focus();
  }, [state.focus]);
  const content = (
    <div className="fd-cf fd-dg is-view" data-new-lead-dialog="">
      <div ref={box} className="fd-cfb" role="dialog" aria-modal="true" aria-labelledby="fd-nl-h">
        <h2 className="fd-pnh" id="fd-nl-h">New lead</h2>
        <p className="fd-pns">{access.canSave ? "It is saved to your CRM." : "It stays on your Leads screen and is not saved."}</p>
        <LeadForm
          idPrefix="fd-nl"
          form={state.form}
          errors={state.errors}
          nameRef={name}
          phoneRef={phone}
          emailRef={email}
          origin={origin}
          onOrigin={setOrigin}
          fill
          canSave={access.canSave}
          addressSearch={access.addressSearch}
          pending={pending}
          problem={saver.problem}
          onField={(field, value) => { saver.clearProblem(); dispatch({ type: "field", field, value }); }}
          onSubmit={saver.submit}
          onCancel={close}
        />
      </div>
    </div>
  );
  const host = document.querySelector(".fd-app");
  return host ? createPortal(content, host) : content;
}
