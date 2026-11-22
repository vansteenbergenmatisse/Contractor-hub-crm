"use client";

import { useEffect, useState } from "react";
import { startHandshake, type HandshakeResult } from "../api/handshake";

const MESSAGES: Record<Exclude<HandshakeResult, "signed_in">, string> = {
  no_access: "Ask Forge Forward for access.",
  no_data: "HighLevel did not answer. Reload this page, or open it from the HighLevel menu.",
  not_embedded: "Open this page from inside HighLevel.",
};

// Plain markup on purpose: the design has no screen for this yet.
export function EmbedBridge() {
  const [result, setResult] = useState<HandshakeResult | null>(null);

  useEffect(() => {
    return startHandshake({
      parent: window.parent,
      self: window,
      listen: (handler) => {
        const listener = (event: MessageEvent) => handler({ source: event.source, data: event.data });
        window.addEventListener("message", listener);
        return () => window.removeEventListener("message", listener);
      },
      fetchImpl: (url, init) => fetch(url, init),
      onResult: (value) => {
        setResult(value);
        // A full navigation, so the new cookie is sent with the very first request.
        if (value === "signed_in") window.location.replace("/");
      },
      retryEveryMs: 1000,
      giveUpAfterMs: 10_000,
    });
  }, []);

  return (
    <main style={{ padding: 24, fontFamily: "system-ui, sans-serif" }}>
      <p role="status">{result === null || result === "signed_in" ? "Signing you in…" : MESSAGES[result]}</p>
    </main>
  );
}
