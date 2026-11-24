"use client";

import { useCallback, useRef, useState } from "react";
import { ORIGIN_LABEL } from "../api/lead-sources";
import { validateLead } from "../api/leads-logic";
import { postLead, SAVE_PROBLEM } from "../api/save-lead";
import type { FormValues, LeadOrigin, LeadsAction } from "../types";

type Options = {
  canSave: boolean;
  form: FormValues;
  origin: LeadOrigin;
  dispatch: (action: LeadsAction) => void;
  // The lead stayed on this screen only (saving is off).
  onLocal: () => void;
  // The CRM has the lead.
  onSaved: () => void;
};

// One submit for both lead forms. With saving off it adds the on-screen row, as before. With saving
// on it posts once, and every answer but "created" keeps the draft in the form.
export function useLeadSubmit({ canSave, form, origin, dispatch, onLocal, onSaved }: Options) {
  const [pending, setPending] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const busy = useRef(false);
  const clearProblem = useCallback(() => setProblem(null), []);

  const submit = async () => {
    if (busy.current) return;
    const valid = !validateLead(form).focus;
    if (!canSave || !valid) {
      dispatch({ type: "submit", origin: origin === "you" ? undefined : ORIGIN_LABEL[origin], channel: origin });
      if (valid) onLocal();
      return;
    }
    busy.current = true;
    setPending(true);
    setProblem(null);
    const result = await postLead({ name: form.name.trim(), phone: form.phone.trim(), email: form.email.trim(), address: form.addr.trim(), source: origin });
    busy.current = false;
    setPending(false);
    if (result === "created") {
      dispatch({ type: "saved" });
      onSaved();
    } else if (result === "invalid_phone") {
      dispatch({ type: "fieldError", field: "phone", message: "Enter a full phone number with area code." });
    } else {
      setProblem(SAVE_PROBLEM[result]);
    }
  };

  return { submit, pending, problem, clearProblem };
}
