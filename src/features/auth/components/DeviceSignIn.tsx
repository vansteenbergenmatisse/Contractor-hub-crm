"use client";

import { useEffect, useState } from "react";
import { AuthCard } from "./AuthCard";

// /device-sign-in#t=<token>: finish signing this device in with a handoff or pairing token.
// The token comes from the URL fragment (never sent to a server by the browser) and is removed from the
// address bar at once. It is only spent when the person taps Continue, so a link preview or a page
// opened by someone else's link signs nobody in by itself (login CSRF).
type State = "ready" | "missing" | "busy" | "failed" | "offline" | "limited";

export function tokenFromHash(hash: string): string | null {
  const value = new URLSearchParams(hash.replace(/^#/, "")).get("t");
  return value && /^[A-Za-z0-9_-]{43}$/.test(value) ? value : null;
}

const MESSAGES: Partial<Record<State, string>> = {
  missing: "This link is not complete. Make a new one from the CRM, or sign in.",
  failed: "This link has expired or was already used. Make a new one, or sign in.",
  offline: "No connection. Check your internet and try again.",
  limited: "Too many tries. Wait a minute and try again.",
};

export function DeviceSignIn() {
  const [token, setToken] = useState<string | null>(null);
  const [state, setState] = useState<State>("busy");

  useEffect(() => {
    const found = tokenFromHash(window.location.hash);
    // Keep the token out of the history and any later copy of the address.
    if (window.location.hash) window.history.replaceState(null, "", window.location.pathname);
    // Reading the address bar is a client-only fact, so it is set after the first render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setToken(found);
    setState(found ? "ready" : "missing");
  }, []);

  async function go() {
    if (!token || state === "busy") return;
    setState("busy");
    try {
      const response = await fetch("/api/auth/device-sign-in", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
        credentials: "same-origin",
      });
      if (response.ok) {
        setToken(null);
        // A full load, so the new cookie is sent with the first request.
        window.location.replace("/");
        return;
      }
      setToken(null);
      setState(response.status === 429 ? "limited" : "failed");
    } catch {
      setState("offline");
    }
  }

  const message = MESSAGES[state];
  return (
    <AuthCard title="Open your CRM" subtitle="Tap Continue to stay signed in on this device.">
      {message ? <p className="fd-lerr" role="alert">{message}</p> : null}
      {token ? (
        <button type="button" className="fd-btn is-fill fd-lgo" onClick={go} disabled={state === "busy"}>
          {state === "busy" ? "Signing in" : "Continue"}
        </button>
      ) : (
        <a className="fd-btn is-plain fd-lgo" href="/sign-in">Go to sign in</a>
      )}
    </AuthCard>
  );
}
