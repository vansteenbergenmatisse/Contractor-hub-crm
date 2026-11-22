"use client";

import { useEffect } from "react";
import { useKeptReducer, useRowFocus, useShell } from "@/features/app-shell";
import { canSend, editInvoice, fixMissing, markPaid, markSent, matchesFilter, rowFillNo, sendRequest } from "../api/invoices";
import { buildMockInvoices } from "../mock";
import type { EditForm, Filter, Invoice } from "../types";

export const SHEET_ID = "fd-iv-sheet";
export const viewButtonId = (no: number) => `fd-iv-v${no}`;

const focusId = (id: string) => {
  setTimeout(() => document.getElementById(id)?.focus(), 0);
};
const isPhone = () => {
  try { return window.matchMedia("(max-width: 1023px)").matches; } catch { return false; }
};
const isOneColumn = () => {
  try { return window.matchMedia("(min-width: 1024px) and (max-width: 1199px)").matches; } catch { return false; }
};

type State = {
  now: Date;
  invoices: Invoice[];
  sel: number;
  doc: boolean;
  editing: boolean;
  editError: string;
  form: EditForm;
  filter: Filter;
  fixText: Record<number, string>;
  fixError: Record<number, string>;
};
// A change is a patch of the state, or a function of the latest state (for the send timer's onDone,
// which runs 20 seconds later).
type Patch = Partial<State> | ((s: State) => Partial<State>);

const reducer = (s: State, patch: Patch): State => ({ ...s, ...(typeof patch === "function" ? patch(s) : patch) });

const init = (now: Date): State => {
  const invoices = buildMockInvoices(now);
  return {
    now, invoices, sel: invoices[0]?.no ?? 0, doc: false, editing: false, editError: "",
    form: { name: "", addr: "", svc: "", price: "" }, filter: "all", fixText: {}, fixError: {},
  };
};

const swap = (list: Invoice[], next: Invoice) => list.map((i) => (i.no === next.no ? next : i));

// All screen state of the invoices page. Local only: nothing is fetched, saved or sent. The state is
// kept while the signed-in shell is mounted, so an invoice sent or paid stays that way across pages.
export function useInvoices() {
  const shell = useShell();
  const [state, set] = useKeptReducer("invoices", reducer, new Date(), init);
  const { now, invoices, sel, doc, editing, editError, form, filter, fixText, fixError } = state;

  const selected = invoices.find((i) => i.no === sel) ?? invoices[0];
  const fillNo = rowFillNo(invoices);

  // A link (?row=invoice-<no>, from search) brings that row into view and flashes it (useRowFocus),
  // on open and whenever the link changes while the page is open. A filter that hides the row is
  // cleared first, as in the design.
  const rowLink = useRowFocus(invoices.map((i) => `invoice-${i.no}`)) ?? "";
  useEffect(() => {
    const linked = invoices.find((i) => `invoice-${i.no}` === rowLink);
    if (linked && !matchesFilter(filter, linked.st)) set({ filter: "all" });
    // Runs when the link changes; a later filter press must not be undone.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rowLink]);

  return {
    now, invoices, selected, doc, editing, editError, form, filter, fixText, fixError,
    setFilter: (next: Filter) => set({ filter: next }),
    setForm: (next: EditForm) => set({ form: next }),
    setFixText: (no: number, text: string) => set((s) => ({ fixText: { ...s.fixText, [no]: text } })),
    view(no: number) {
      set({ sel: no, doc: true, editing: false, editError: "" });
      if (isPhone()) document.querySelector(".fd-main")?.scrollTo?.({ top: 0 });
      else {
        // On a computer the sheet sits beside (or under) the list: move the focus to it.
        setTimeout(() => {
          const sheet = document.getElementById(SHEET_ID);
          if (isOneColumn()) sheet?.scrollIntoView?.({ block: "start" });
          sheet?.focus({ preventScroll: true });
        }, 0);
      }
    },
    shut() {
      const at = selected?.no;
      set({ doc: false, editing: false, editError: "" });
      // Back returns the focus to the View button of the row it came from.
      if (at !== undefined) {
        setTimeout(() => {
          if (isPhone()) document.getElementById(`fd-iv-r${at}`)?.scrollIntoView?.({ block: "center" });
          document.getElementById(viewButtonId(at))?.focus({ preventScroll: isPhone() });
        }, 60);
      }
    },
    make(no: number) {
      const inv = invoices.find((i) => i.no === no);
      if (!inv) return;
      const result = fixMissing(inv, fixText[no] ?? "");
      if (!result.ok) {
        set({ fixError: { [no]: result.error } });
        focusId(`fd-iv-${no}`);
        return;
      }
      set((s) => ({ invoices: swap(s.invoices, result.invoice), fixError: {}, fixText: { ...s.fixText, [no]: "" }, sel: no }));
    },
    // Opens the shared 20 second timer. At 0 the invoice is marked Sent on screen. Nothing is sent.
    send(no: number) {
      const inv = invoices.find((i) => i.no === no);
      if (!inv || !canSend(inv)) return;
      shell.sendTimer(
        sendRequest(inv, () => {
          set((s) => ({ invoices: s.invoices.map((i) => (i.no === no ? markSent(i, new Date()) : i)), sel: no }));
        }),
      );
    },
    paid(no: number) {
      set((s) => ({ invoices: s.invoices.map((i) => (i.no === no ? markPaid(i, new Date()) : i)), sel: no }));
    },
    startEdit() {
      if (!selected) return;
      set({ form: { name: selected.name, addr: selected.addr, svc: selected.svc, price: selected.amt ? String(selected.amt) : "" }, editError: "", editing: true });
      focusId("fd-ie-name");
    },
    cancelEdit() {
      set({ editing: false, editError: "" });
    },
    saveEdit() {
      if (!selected) return;
      const result = editInvoice(selected, form);
      if (!result.ok) {
        set({ editError: result.error });
        focusId(result.error === "Say what the work was." ? "fd-ie-t0" : "fd-ie-a0");
        return;
      }
      set((s) => ({ invoices: swap(s.invoices, result.invoice), editing: false, editError: "" }));
    },
    isFirstReady: (no: number) => no === fillNo,
  };
}

export type InvoicesState = ReturnType<typeof useInvoices>;
