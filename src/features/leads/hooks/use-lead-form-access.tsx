"use client";

import { useEffect, useSyncExternalStore } from "react";
import { NO_FORM_ACCESS, type LeadFormAccess } from "../api/form-access";

// The New lead dialog is mounted on every signed-in page and gets this person's access from the
// server. It shares that here so the Leads page form follows the same answer. Browser only: the
// server render always reads "no access", and the dialog clears it when it unmounts.
let current: LeadFormAccess = NO_FORM_ACCESS;
const listeners = new Set<() => void>();

function publish(next: LeadFormAccess) {
  current = next;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function useLeadFormAccess(): LeadFormAccess {
  return useSyncExternalStore(subscribe, () => current, () => NO_FORM_ACCESS);
}

export function usePublishLeadFormAccess(access: LeadFormAccess) {
  const { canSave, addressSearch } = access;
  useEffect(() => {
    publish({ canSave, addressSearch });
    return () => publish(NO_FORM_ACCESS);
  }, [canSave, addressSearch]);
}
