"use client";

import { useState } from "react";
import { useShell } from "@/features/app-shell";
import { canSend, editInvoice, fixMissing, markPaid, markSent, rowFillNo, sendRequest } from "../api/invoices";
import { buildMockInvoices } from "../mock";
import type { EditForm, Filter, Invoice } from "../types";
import { useWide } from "./use-wide";

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

// All screen state of the invoices page. Local only: nothing is fetched, saved or sent.
export function useInvoices() {
  const shell = useShell();
  const [now] = useState(() => new Date());
  const [invoices, setInvoices] = useState<Invoice[]>(() => buildMockInvoices(now));
  const [sel, setSel] = useState<number>(() => invoices[0]?.no ?? 0);
  const [doc, setDoc] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editError, setEditError] = useState("");
  const [form, setForm] = useState<EditForm>({ name: "", addr: "", svc: "", price: "" });
  const [filter, setFilter] = useState<Filter>("all");
  const [fixText, setFixText] = useState<Record<number, string>>({});
  const [fixError, setFixError] = useState<Record<number, string>>({});

  const selected = invoices.find((i) => i.no === sel) ?? invoices[0];
  const replace = (next: Invoice) => setInvoices((list) => list.map((i) => (i.no === next.no ? next : i)));
  const wide = useWide();
  const fillNo = rowFillNo(invoices, selected, editing, wide);

  return {
    now, invoices, selected, doc, editing, editError, form, filter, fixText, fixError,
    setFilter,
    setForm,
    setFixText: (no: number, text: string) => setFixText((t) => ({ ...t, [no]: text })),
    view(no: number) {
      setSel(no);
      setDoc(true);
      setEditing(false);
      setEditError("");
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
      setDoc(false);
      setEditing(false);
      setEditError("");
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
        setFixError({ [no]: result.error });
        focusId(`fd-iv-${no}`);
        return;
      }
      replace(result.invoice);
      setFixError({});
      setFixText((t) => ({ ...t, [no]: "" }));
      setSel(no);
    },
    // Opens the shared 20 second timer. At 0 the invoice is marked Sent on screen. Nothing is sent.
    send(no: number) {
      const inv = invoices.find((i) => i.no === no);
      if (!inv || !canSend(inv)) return;
      shell.sendTimer(
        sendRequest(inv, () => {
          setInvoices((list) => list.map((i) => (i.no === no ? markSent(i, new Date()) : i)));
          setSel(no);
        }),
      );
    },
    paid(no: number) {
      setInvoices((list) => list.map((i) => (i.no === no ? markPaid(i, new Date()) : i)));
      setSel(no);
    },
    startEdit() {
      if (!selected) return;
      setForm({ name: selected.name, addr: selected.addr, svc: selected.svc, price: selected.amt ? String(selected.amt) : "" });
      setEditError("");
      setEditing(true);
      focusId("fd-ie-name");
    },
    cancelEdit() {
      setEditing(false);
      setEditError("");
    },
    saveEdit() {
      if (!selected) return;
      const result = editInvoice(selected, form);
      if (!result.ok) {
        setEditError(result.error);
        focusId(result.error === "Say what the work was." ? "fd-ie-t0" : "fd-ie-a0");
        return;
      }
      replace(result.invoice);
      setEditing(false);
      setEditError("");
    },
    isFirstReady: (no: number) => no === fillNo,
  };
}

export type InvoicesState = ReturnType<typeof useInvoices>;
