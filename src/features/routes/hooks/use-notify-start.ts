"use client";

import { useCallback, useRef, useState, useSyncExternalStore } from "react";
import { isNotifiableCalendar } from "../api/notify-rule";
import type { NotifyDisplay, NotifyRefusal, RouteJob, RoutesNotifyView } from "../types";

const REQUEST_TIMEOUT_MS = 45_000;
const REFUSALS: readonly string[] = ["wrong_type", "not_next", "no_contact", "past", "unsure_next", "unavailable"];
const listeners = new Set<() => void>();
const memory = new Map<string, boolean>(); // keeps the choice for this page when storage is blocked

function readChoice(key: string): boolean {
  try {
    return localStorage.getItem(key) === "on";
  } catch {
    return memory.get(key) ?? false;
  }
}

function writeChoice(key: string, on: boolean) {
  try {
    localStorage.setItem(key, on ? "on" : "off");
    memory.delete(key);
  } catch {
    memory.set(key, on); // blocked storage: the choice lasts until the page closes
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

async function askServer(appointmentId: string): Promise<NotifyDisplay> {
  try {
    const response = await fetch("/api/routes/notify", {
      method: "POST",
      keepalive: true, // the tap also opens Maps, which can put this page in the background
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ appointmentId }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (response.status >= 500) return { status: "unconfirmed" };
    if (!response.ok) return { status: "refused", reason: "unavailable" };
    const body = await response.json() as { status?: unknown; reason?: unknown };
    if (body.status === "notified" || body.status === "failed" || body.status === "unconfirmed") return { status: body.status };
    if (body.status === "refused") {
      return { status: "refused", reason: REFUSALS.includes(String(body.reason)) ? body.reason as NotifyRefusal : "unavailable" };
    }
    return { status: "unconfirmed" };
  } catch {
    return { status: "unconfirmed" }; // the request may have reached the server
  }
}

// The toggle, remembered per user on this device, and the one request a Start may send.
export function useNotifyStart(view: RoutesNotifyView | null | undefined) {
  const key = view ? `routes-notify-start:${view.userId}` : null;
  const on = useSyncExternalStore(subscribe, () => (key ? readChoice(key) : false), () => false);
  const [results, setResults] = useState<Record<string, NotifyDisplay>>({});
  const inFlight = useRef(new Set<string>());
  const stored = view?.outcomes;

  const displayFor = useCallback((jobId: string): NotifyDisplay | null => {
    const live = results[jobId];
    if (live) return live;
    const saved = stored?.[jobId];
    return saved ? { status: saved } : null;
  }, [results, stored]);

  const toggle = useCallback(() => {
    if (key) writeChoice(key, !readChoice(key));
  }, [key]);

  // Never blocks the Maps link: the tap's default action carries on while this runs.
  const onStart = useCallback((job: RouteJob) => {
    if (!view || !on || !isNotifiableCalendar(job.service) || inFlight.current.has(job.id)) return;
    const shown = displayFor(job.id);
    if (shown && shown.status !== "refused") return;
    inFlight.current.add(job.id);
    void askServer(job.id).then((result) => {
      inFlight.current.delete(job.id);
      setResults((current) => ({ ...current, [job.id]: result }));
    });
  }, [view, on, displayFor]);

  return { on, toggle, onStart, displayFor };
}
