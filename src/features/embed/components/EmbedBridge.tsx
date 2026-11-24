"use client";

import { useEffect, useState } from "react";
import { startHandshake, type HandshakeResult } from "../api/handshake";
import { claimAutoJump, fullScreenUrl, tryTopNavigation, type TabStorage, type TopWindow } from "../api/full-screen";
import { EMBED_DENIAL_MESSAGES, type EmbedDenialCode } from "../api/denial";

// "no_access" says why when the handshake knows (it always does in the browser: the server's code,
// or "other"). The plain text below is only left for a refusal that came with no reason.
// The page HighLevel opens; loading it again runs the in-frame sign-in again.
const EMBED_PATH = "/embed";

const MESSAGES:Record<Exclude<HandshakeResult, "signed_in">, string> = {
  no_access: "Ask Forge Forward for access.",
  no_data: "HighLevel did not answer. Reload this page, or open it from the HighLevel menu.",
  not_embedded: "Open this page from inside HighLevel.",
};

// Plain markup on purpose: the design has no screen for this yet.
// After sign-in with a handoff token (user decision 2026-11-24): first try to move the whole tab to the
// full-screen CRM, once per tab and replacing the history entry, so Back does not loop; if HighLevel's
// frame does not allow that, or this tab already jumped once, the person taps "Open full screen" (or a
// new tab). "Use it here" keeps the CRM inside HighLevel, as before.
// A full navigation, so the new cookie is sent with the very first request.
const replaceLocation = (url: string) => window.location.replace(url);
// Read lazily: touching sessionStorage can throw when the browser blocks storage in a frame.
const tabStorage = (): TabStorage | null => window.sessionStorage;
const realTop = (): TopWindow => window.top;

function readStorage(get: () => TabStorage | null): TabStorage | null {
  try {
    return get();
  } catch {
    return null;
  }
}

export function EmbedBridge({
  goTo = replaceLocation,
  storage = tabStorage,
  topWindow = realTop,
}: {
  goTo?: (url: string) => void;
  storage?: () => TabStorage | null;
  topWindow?: () => TopWindow;
} = {}) {
  const [result, setResult] = useState<HandshakeResult | null>(null);
  const [handoffUrl, setHandoffUrl] = useState<string | null>(null);
  const [denial, setDenial] = useState<EmbedDenialCode | null>(null);

  useEffect(() => {
    let url: string | null = null;
    return startHandshake({
      parent: window.parent,
      self: window,
      listen: (handler) => {
        const listener = (event: MessageEvent) => handler({ source: event.source, data: event.data });
        window.addEventListener("message", listener);
        return () => window.removeEventListener("message", listener);
      },
      fetchImpl: (url, init) => fetch(url, init),
      onHandoff: (token) => {
        url = fullScreenUrl(window.location.origin, token);
      },
      onResult: (value, why) => {
        if (why) setDenial(why);
        setResult(value);
        if (value !== "signed_in") return;
        if (url) {
          setHandoffUrl(url);
          if (claimAutoJump(readStorage(storage))) tryTopNavigation(topWindow(), window, url);
          return;
        }
        goTo("/");
      },
      retryEveryMs: 1000,
      giveUpAfterMs: 10_000,
    });
    // The handshake runs once per page load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (result === "signed_in" && handoffUrl) {
    return (
      <main style={{ padding: 24, fontFamily: "system-ui, sans-serif", display: "grid", gap: 12, maxWidth: 420 }}>
        <p role="status">You are signed in. Open the CRM full screen to stay signed in on this device.</p>
        <a href={handoffUrl} target="_top" style={{ padding: "12px 16px", minHeight: 44, borderRadius: 8, background: "CanvasText", color: "Canvas", textAlign: "center", textDecoration: "none" }}>
          Open full screen
        </a>
        <a href={handoffUrl} target="_blank" rel="noopener noreferrer" style={{ padding: "12px 16px", minHeight: 44, textAlign: "center" }}>
          Open in a new tab
        </a>
        <button type="button" onClick={() => goTo("/")} style={{ padding: "12px 16px", minHeight: 44, background: "none", border: "1px solid currentColor", borderRadius: 8 }}>
          Use it here, inside HighLevel
        </button>
      </main>
    );
  }

  // A refusal or no answer from HighLevel: one obvious action, run the sign-in again (a fresh /embed
  // load repeats the handshake). Not when the page is not inside HighLevel: a reload cannot fix that.
  const canRetry = result === "no_access" || result === "no_data";
  return (
    <main style={{ padding: 24, fontFamily: "system-ui, sans-serif", display: "grid", gap: 12, maxWidth: 420 }}>
      <p role="status">
        {result === null || result === "signed_in"
          ? "Signing you in…"
          : result === "no_access" && denial
            ? EMBED_DENIAL_MESSAGES[denial]
            : MESSAGES[result]}
      </p>
      {canRetry ? (
        <button type="button" onClick={() => goTo(EMBED_PATH)} style={{ padding: "12px 16px", minHeight: 44, borderRadius: 8, border: "none", background: "CanvasText", color: "Canvas" }}>
          Try again
        </button>
      ) : null}
    </main>
  );
}
