"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AuthCard } from "./AuthCard";
import type { DeviceSignInPreview } from "../api/device-sign-in";

// /device-sign-in#t=<token>: finish signing this device in with a handoff or pairing token.
// The token comes from the URL fragment (never sent to a server by the browser) and is removed from the
// address bar at once. The page first asks who and which business the link signs in (a preview that
// does not spend the token) and warns when another person is signed in here, so a link someone else
// sent cannot switch accounts silently. The token is only spent when the person taps Continue, so a
// link preview or a page opened by someone else's link signs nobody in by itself (login CSRF).
type State = "checking" | "ready" | "missing" | "busy" | "failed" | "offline" | "limited";

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

type Props = {
  // The request already had a session (maybe only the framed one-day "do not remember" one, or another
  // user's). A token is still redeemed on Continue and replaces it; without a token the visitor goes
  // to the app once.
  signedIn?: boolean;
  // The masked email of whoever is signed in on this device (j•••@gmail.com), or null.
  currentPerson?: string | null;
  goTo?: (url: string) => void;
};

// A full load, so the new cookie is sent with the first request.
const replaceLocation = (url: string) => window.location.replace(url);

const post = (url: string, token: string) =>
  fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token }), credentials: "same-origin" });

function isPreview(value: unknown): value is DeviceSignInPreview {
  const v = value as Partial<DeviceSignInPreview> | null;
  return (
    typeof v === "object" && v !== null && typeof v.person === "string" &&
    (v.business === null || typeof v.business === "string") &&
    (v.sameAsCurrent === null || typeof v.sameAsCurrent === "boolean")
  );
}

export function DeviceSignIn({ signedIn = false, currentPerson = null, goTo = replaceLocation }: Props) {
  const [token, setToken] = useState<string | null>(null);
  const [state, setState] = useState<State>("busy");
  const [preview, setPreview] = useState<DeviceSignInPreview | null>(null);

  async function check(value: string) {
    setState("checking");
    try {
      const response = await post("/api/auth/device-sign-in-preview", value);
      if (response.status === 429) return setState("limited");
      const body: unknown = response.ok ? await response.json().catch(() => null) : null;
      if (!isPreview(body)) {
        setToken(null);
        return setState("failed");
      }
      setPreview(body);
      setState("ready");
    } catch {
      setState("offline");
    }
  }

  useEffect(() => {
    const found = tokenFromHash(window.location.hash);
    // Keep the token out of the history and any later copy of the address.
    if (window.location.hash) window.history.replaceState(null, "", window.location.pathname);
    if (!found && signedIn) {
      goTo("/");
      return;
    }
    // Reading the address bar is a client-only fact, so it is set after the first render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setToken(found);
    if (found) void check(found);
    else setState("missing");
    // Once, on arrival: the fragment is read and cleared a single time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function go() {
    if (!token || !preview || state === "busy") return;
    setState("busy");
    try {
      const response = await post("/api/auth/device-sign-in", token);
      if (response.ok) {
        setToken(null);
        goTo("/");
        return;
      }
      setToken(null);
      setState(response.status === 429 ? "limited" : "failed");
    } catch {
      setState("offline");
    }
  }

  const message = MESSAGES[state];
  // The preview is shown only while its token can still be used.
  const shown = token ? preview : null;
  const other = shown?.sameAsCurrent === false;
  const person = shown?.person;
  let action;
  if (token && shown) {
    const continueButton = (
      <button type="button" className="fd-btn is-fill fd-lgo" onClick={go} disabled={state === "busy"}>
        {state === "busy" ? "Signing in" : other ? `Continue as ${person}` : "Continue"}
      </button>
    );
    action = other ? (
      <div className="fd-lhl">
        {continueButton}
        <Link className="fd-btn is-plain fd-lgo" href="/">{currentPerson ? `Stay signed in as ${currentPerson}` : "Stay signed in"}</Link>
      </div>
    ) : (
      continueButton
    );
  } else if (token && state === "checking") {
    action = <button type="button" className="fd-btn is-fill fd-lgo" disabled>Checking the link</button>;
  } else if (token && (state === "offline" || state === "limited")) {
    action = <button type="button" className="fd-btn is-fill fd-lgo" onClick={() => void check(token)}>Try again</button>;
  } else {
    action = <a className="fd-btn is-plain fd-lgo" href="/sign-in">Go to sign in</a>;
  }

  return (
    <AuthCard title="Open your CRM" subtitle="Tap Continue to stay signed in on this device.">
      {shown ? <p className="fd-lsub">{`This link signs in ${shown.person}${shown.business ? ` at ${shown.business}` : ""}.`}</p> : null}
      {other && !message ? (
        <p className="fd-lerr" role="alert">
          {`You are signed in as ${currentPerson ?? "another person"} on this device. Continue signs you in as ${person} instead.`}
        </p>
      ) : null}
      {message ? <p className="fd-lerr" role="alert">{message}</p> : null}
      {action}
    </AuthCard>
  );
}
