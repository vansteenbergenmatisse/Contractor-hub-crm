"use client";

import { useEffect, useRef, useState, type FormEvent, type MouseEvent } from "react";
import { useSearchParams } from "next/navigation";
import { afterPause } from "@/shared/lib/after-pause";
import { canDownloadInPage, downloadExport } from "../api/export-download";
import { exportAnswer } from "../api/export-answer";
import { RESULT_COOKIE, RESULT_COOKIE_ATTRIBUTES, resultFromCookie, STAY_ACTION } from "../api/export-stay";

// Longer than the route's 60-second limit. A stopped or lost download sends no result cookie, so the
// button comes back on its own after this.
const GIVE_UP_MS = 75_000;
const NO_ANSWER = "We could not confirm the export finished. Check your downloads, or try again.";

type CookieChange = Event & { changed?: readonly { name?: string; value?: string }[] };
const cookieEvents = () => (globalThis as { cookieStore?: EventTarget }).cookieStore;

// A new try drops the old failure from the screen and the address, so it cannot sit beside a
// successful download or return on refresh.
function clearExportFromAddress() {
  const url = new URL(window.location.href);
  if (!url.searchParams.has("export")) return;
  url.searchParams.delete("export");
  window.history.replaceState(window.history.state, "", url);
}

// The busy state ends only when the result cookie arrives, so it is used only where that cookie can
// be written and observed. Anywhere else the plain post runs and nothing can stay stuck.
function canSeeResult(): boolean {
  if (!cookieEvents()) return false;
  const probe = "leads-export-probe";
  document.cookie = `${probe}=1; ${RESULT_COOKIE_ATTRIBUTES}`;
  const written = document.cookie.includes(`${probe}=1`);
  document.cookie = `${probe}=; Path=/; Max-Age=0; SameSite=None; Secure`;
  return written;
}

// Owner only: the server decides whether this renders, and the route checks again. Without
// JavaScript this is a plain form post.
export function ExportPanel() {
  const code = useSearchParams().get("export");
  const [retried, setRetried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const pending = useRef(false);
  const cancelGiveUp = useRef<(() => void) | null>(null);
  const inFlight = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  const message = failure ?? (retried ? null : exportAnswer(code));

  useEffect(() => {
    const store = cookieEvents();
    if (!store) return;
    const onChange = (event: Event) => {
      const result = (event as CookieChange).changed?.find((c) => c.name === RESULT_COOKIE);
      if (!result || !pending.current) return;
      pending.current = false;
      cancelGiveUp.current?.();
      setBusy(false);
      setFailure(exportAnswer(resultFromCookie(result.value)));
    };
    store.addEventListener("change", onChange);
    return () => store.removeEventListener("change", onChange);
  }, []);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      cancelGiveUp.current?.();
      inFlight.current?.abort();
    };
  }, []);

  // The normal path with JavaScript. A click also covers Enter, which browsers turn into a click on
  // the submit button. The form post below stays for no JavaScript and browsers without blob saving.
  async function onExportClick(event: MouseEvent<HTMLButtonElement>) {
    if (pending.current) {
      event.preventDefault();
      return;
    }
    if (!canDownloadInPage()) return;
    event.preventDefault();
    const form = event.currentTarget.form;
    const includeContact = !!form && new FormData(form).get("includeContact") === "1";
    const controller = new AbortController();
    inFlight.current = controller;
    pending.current = true;
    setRetried(true);
    setFailure(null);
    setBusy(true);
    clearExportFromAddress();
    const cancelTimeout = afterPause(() => controller.abort(), GIVE_UP_MS);
    const outcome = await downloadExport(includeContact, controller.signal);
    cancelTimeout();
    if (inFlight.current !== controller) return;
    inFlight.current = null;
    pending.current = false;
    if (controller.signal.aborted && !mounted.current) return;
    setBusy(false);
    setFailure(exportAnswer(outcome));
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    if (pending.current) {
      event.preventDefault();
      return;
    }
    setRetried(true);
    setFailure(null);
    clearExportFromAddress();
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    if (!(submitter instanceof HTMLButtonElement)) return;
    if (!canSeeResult()) {
      submitter.removeAttribute("formaction");
      return;
    }
    submitter.setAttribute("formaction", STAY_ACTION);
    pending.current = true;
    setBusy(true);
    cancelGiveUp.current = afterPause(() => {
      if (!pending.current) return;
      pending.current = false;
      setBusy(false);
      setFailure(NO_ANSWER);
    }, GIVE_UP_MS);
  }

  return (
    <section className="fd-pnl" aria-labelledby="fd-ld-x">
      <h2 className="fd-pnh" id="fd-ld-x">Export leads</h2>
      <p className="fd-pns">Name, source and date. A long list may hold only your newest leads, and the file name then says partial.</p>
      <form method="post" action="/api/leads/export" onSubmit={onSubmit}>
        <input type="hidden" name="from" value="leads" />
        <label style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 44 }}>
          <input type="checkbox" name="includeContact" value="1" />
          <span>Include phone, email and address</span>
        </label>
        <button type="submit" className="fd-btn is-plain" aria-busy={busy || undefined} onClick={onExportClick}>{busy ? "Exporting..." : "Export CSV"}</button>
      </form>
      {message ? <p className="fd-pns" role="alert">{message}</p> : null}
    </section>
  );
}
