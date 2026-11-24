"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useDialog, useKeptReducer } from "@/features/app-shell";
import { NEW_LEAD_EVENT } from "@/shared/lib/new-lead-event";
import { DEFAULT_ORIGIN, ORIGIN_LABEL } from "../api/lead-sources";
import { createInitialState, leadsReducer, validateLead } from "../api/leads-logic";
import type { Lead, LeadOrigin } from "../types";
import { LeadForm } from "./LeadForm";

const NO_LEADS: readonly Lead[] = [];

// The New lead form over any page. It shares the Leads page's kept state, so a draft and a lead that
// stays on screen are the same on both. It saves nothing.
export function NewLeadDialog() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onRequest = (event: Event) => {
      event.preventDefault();
      setOpen(true);
    };
    window.addEventListener(NEW_LEAD_EVENT, onRequest);
    return () => window.removeEventListener(NEW_LEAD_EVENT, onRequest);
  }, []);
  return open ? <OpenDialog onClose={() => setOpen(false)} /> : null;
}

function OpenDialog({ onClose }: { onClose: () => void }) {
  const [state, dispatch] = useKeptReducer("leads", leadsReducer, NO_LEADS, createInitialState);
  const [origin, setOrigin] = useState<LeadOrigin>(DEFAULT_ORIGIN);
  const box = useRef<HTMLDivElement | null>(null);
  const name = useRef<HTMLInputElement | null>(null);
  const phone = useRef<HTMLInputElement | null>(null);
  const email = useRef<HTMLInputElement | null>(null);
  const close = useCallback(() => {
    dispatch({ type: "closeAdd" });
    onClose();
  }, [dispatch, onClose]);
  useDialog(box, close, true);
  useEffect(() => {
    name.current?.focus();
  }, []);
  useEffect(() => {
    if (state.focus) ({ name, phone, email })[state.focus.field].current?.focus();
  }, [state.focus]);
  const submit = () => {
    const valid = !validateLead(state.form).focus;
    dispatch({ type: "submit", origin: origin === "you" ? undefined : ORIGIN_LABEL[origin] });
    if (valid) onClose();
  };
  const content = (
    <div className="fd-cf fd-dg is-view" data-new-lead-dialog="">
      <div ref={box} className="fd-cfb" role="dialog" aria-modal="true" aria-labelledby="fd-nl-h">
        <h2 className="fd-pnh" id="fd-nl-h">New lead</h2>
        <p className="fd-pns">It stays on your Leads screen and is not saved.</p>
        <LeadForm
          idPrefix="fd-nl"
          form={state.form}
          errors={state.errors}
          nameRef={name}
          phoneRef={phone}
          emailRef={email}
          origin={origin}
          onOrigin={setOrigin}
          originFirst
          fill
          onField={(field, value) => dispatch({ type: "field", field, value })}
          onSubmit={submit}
          onCancel={close}
        />
      </div>
    </div>
  );
  const host = document.querySelector(".fd-app");
  return host ? createPortal(content, host) : content;
}
