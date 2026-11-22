"use client";

import { useKeptReducer } from "@/features/app-shell";
import { buildMockInvoices } from "../mock";
import type { InvoicesKeptState, InvoicesPatch } from "../types";

// The page-state key of the invoices. Payments and Today read the same state through useInvoicesKept.
export const INVOICES_KEY = "invoices";

// A change is a patch of the state, or a function of the latest state (for the send timer's onDone,
// which runs 20 seconds later, maybe after the page has gone).
export const invoicesReducer = (s: InvoicesKeptState, patch: InvoicesPatch): InvoicesKeptState => ({
  ...s,
  ...(typeof patch === "function" ? patch(s) : patch),
});

export const initInvoices = (now: Date): InvoicesKeptState => {
  const invoices = buildMockInvoices(now);
  return {
    now, invoices, sel: invoices[0]?.no ?? 0, doc: false, editing: false, editError: "",
    form: { name: "", addr: "", svc: "", price: "" }, filter: "all", fixText: {}, fixError: {},
  };
};

// The live Invoices state, kept while the signed-in shell is mounted (mock data, Phase 2). The
// Invoices page and other pages (Payments, Today) share it: a send or a Mark paid shows everywhere.
export function useInvoicesKept(): [InvoicesKeptState, (patch: InvoicesPatch) => void] {
  return useKeptReducer(INVOICES_KEY, invoicesReducer, new Date(), initInvoices);
}
