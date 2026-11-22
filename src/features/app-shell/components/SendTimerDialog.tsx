"use client";

import { useEffect, useRef, useState } from "react";
import { createSendController, sendDialogHandlers, type SendController, type SendDialogHandlers, type TimerState } from "../api/send-timer";
import type { SendTimerRequest } from "../types";
import { useDialog } from "../hooks/use-dialog";
import { SendTimerView } from "./SendTimerView";
import { useBusiness } from "./ShellContext";

// Every press that sends a quote or an invoice opens this. It counts 20 to 0 and then runs onDone.
// Cancel sends nothing. "View" shows the document and pauses the count; Back goes on.
// Phase 2: nothing leaves this app. The server hold arrives in Phase 3.
// Mount it with a new `key` for every send, so each one starts a fresh count.
// Every decision lives in `createSendController` (api/send-timer.ts); this file only draws it.
// `request` and `onClose` are read once, when the dialog mounts.
export function SendTimerDialog({ request, onClose, tickMs = 1000 }: { request: SendTimerRequest; onClose: () => void; tickMs?: number }) {
  const business = useBusiness();
  const actionRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const refocus = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [timer, setTimer] = useState<TimerState | null>(null);
  const [setup] = useState(() => {
    const waits = new Set<ReturnType<typeof setTimeout>>();
    const controller: SendController = createSendController({
      onDone: request.onDone,
      onClose,
      onChange: setTimer,
      schedule: (fn, ms) => {
        const id = setTimeout(() => { waits.delete(id); fn(); }, ms);
        waits.add(id);
        return () => { clearTimeout(id); waits.delete(id); };
      },
    });
    return { controller, waits, handlers: sendDialogHandlers(controller) };
  });

  useEffect(() => {
    const id = setTimeout(() => actionRef.current?.focus(), 80);
    return () => clearTimeout(id);
  }, []);

  useEffect(() => {
    const { controller, waits } = setup;
    const id = setInterval(() => controller.tick(), tickMs);
    return () => {
      clearInterval(id);
      clearTimeout(refocus.current);
      for (const wait of waits) clearTimeout(wait);
      waits.clear();
    };
  }, [setup, tickMs]);

  const state = timer ?? setup.controller.state();
  const handlers: SendDialogHandlers = {
    ...setup.handlers,
    // Back puts focus on Cancel again, like the design.
    onBack: () => {
      setup.handlers.onBack();
      clearTimeout(refocus.current);
      refocus.current = setTimeout(() => actionRef.current?.focus(), 80);
    },
  };
  // Escape goes back from the document when it is shown, else cancels (design logic `uxEsc`).
  // Tab stays in the dialog; on close focus goes back to the button that opened it.
  useDialog(dialogRef, () => (setup.controller.state().viewing ? handlers.onBack() : handlers.onCancel()));
  return <SendTimerView request={request} business={business} state={state} handlers={handlers} actionRef={actionRef} dialogRef={dialogRef} />;
}
