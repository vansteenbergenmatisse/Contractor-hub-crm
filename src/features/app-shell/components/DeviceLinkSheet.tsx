"use client";

import { useEffect, useRef, useState } from "react";
import { useDialog } from "../hooks/use-dialog";
import { sheetOnTop } from "../api/gestures";

// "Open on my phone or laptop": asks the server for a single-use, 5-minute sign-in link for this
// person (POST /api/auth/device-pairing) and shows it to copy. Same sheet look and focus rules as Send
// feedback. There is no QR code library in the project, so the link is shown on its own and the sheet
// says how to use it (no fake QR).
type State =
  | { kind: "loading" }
  | { kind: "ready"; link: string; expiresAt: string }
  | { kind: "error"; message: string };

export async function requestPairingLink(fetchImpl: typeof fetch = fetch): Promise<State> {
  try {
    const response = await fetchImpl("/api/auth/device-pairing", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
      credentials: "same-origin",
    });
    if (response.ok) {
      const body = (await response.json()) as { link?: unknown; expiresAt?: unknown };
      if (typeof body.link === "string" && typeof body.expiresAt === "string") return { kind: "ready", link: body.link, expiresAt: body.expiresAt };
      return { kind: "error", message: "Could not make a link. Try again." };
    }
    if (response.status === 429) return { kind: "error", message: "Too many links. Wait a minute and try again." };
    if (response.status === 401) return { kind: "error", message: "You are signed out. Sign in again first." };
    if (response.status === 403) return { kind: "error", message: "This account cannot make a sign-in link." };
    return { kind: "error", message: "Could not make a link. Try again." };
  } catch {
    return { kind: "error", message: "No connection. Check your internet and try again." };
  }
}

export function DeviceLinkSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [copied, setCopied] = useState(false);
  const box = useRef<HTMLElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  useDialog(box, onClose, open, { yieldTo: () => sheetOnTop(box.current) });

  const load = () => {
    setState({ kind: "loading" });
    setCopied(false);
    void requestPairingLink().then(setState);
  };

  useEffect(() => {
    if (!open) return;
    let live = true;
    void requestPairingLink().then((next) => {
      if (live) setState(next);
    });
    const id = setTimeout(() => closeButton.current?.focus(), 80);
    return () => {
      live = false;
      clearTimeout(id);
      setState({ kind: "loading" });
      setCopied(false);
    };
  }, [open]);

  const copy = async () => {
    if (state.kind !== "ready") return;
    try {
      await navigator.clipboard.writeText(state.link);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <section ref={box} className={`fd-fb${open ? " is-open" : ""}`} role="dialog" aria-modal={open ? true : undefined} aria-labelledby="fd-dl-h" aria-hidden={!open}>
      <div className="fd-part">
        <h2 className="fd-fbt" id="fd-dl-h">Open on my phone or laptop</h2>
        <p className="fd-fbs">Open this link on the other device within 5 minutes. It works once and keeps that device signed in.</p>
        {state.kind === "ready" ? (
          <>
            <input className="fd-fbi" readOnly aria-label="Sign-in link" value={state.link} onFocus={(event) => event.currentTarget.select()} />
            <p className="fd-fbs" role="status">{copied ? "Copied. Paste it on the other device." : "A QR code is not available yet: copy the link, or send it to yourself."}</p>
          </>
        ) : state.kind === "error" ? (
          <p className="fd-fbs" role="alert">{state.message}</p>
        ) : (
          <p className="fd-fbs" role="status">Making a link…</p>
        )}
        <div className="fd-fbb">
          <button type="button" ref={closeButton} className="fd-btn is-plain" onClick={onClose}>Close</button>
          {state.kind === "ready" ? (
            <button type="button" className="fd-btn is-fill" onClick={() => void copy()}>Copy link</button>
          ) : (
            <button type="button" className="fd-btn is-fill" disabled={state.kind === "loading"} onClick={load}>New link</button>
          )}
        </div>
      </div>
    </section>
  );
}
