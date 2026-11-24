"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { exportAnswer } from "../api/export-answer";
import { RESULT_COOKIE, RESULT_COOKIE_ATTRIBUTES, resultFromCookie, STAY_ACTION } from "../api/export-stay";

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
  const message = failure ?? (retried ? null : exportAnswer(code));

  useEffect(() => {
    const store = cookieEvents();
    if (!store) return;
    const onChange = (event: Event) => {
      const result = (event as CookieChange).changed?.find((c) => c.name === RESULT_COOKIE);
      if (!result || !pending.current) return;
      pending.current = false;
      setBusy(false);
      setFailure(exportAnswer(resultFromCookie(result.value)));
    };
    store.addEventListener("change", onChange);
    return () => store.removeEventListener("change", onChange);
  }, []);

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
  }

  return (
    <section className="fd-pnl" aria-labelledby="fd-ld-x">
      <h2 className="fd-pnh" id="fd-ld-x">Export leads</h2>
      <p className="fd-pns">Name, source and date. A long list may hold only your newest leads, and the file name then says partial.</p>
      <form method="post" action="/api/leads/export" onSubmit={onSubmit}>
        <label style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 44 }}>
          <input type="checkbox" name="includeContact" value="1" />
          <span>Include phone, email and address</span>
        </label>
        <button type="submit" className="fd-btn is-plain" aria-busy={busy || undefined}>{busy ? "Exporting..." : "Export CSV"}</button>
      </form>
      {message ? <p className="fd-pns" role="alert">{message}</p> : null}
    </section>
  );
}
