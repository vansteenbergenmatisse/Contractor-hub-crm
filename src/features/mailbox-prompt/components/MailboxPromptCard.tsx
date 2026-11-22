"use client";

import { useId } from "react";
import { MAILBOX_PROMPT_COPY as COPY } from "../api/copy";
import { usePromptClosed } from "../hooks/use-prompt-closed";

// A reminder in the page flow, so it never covers a control. It wraps at phone width.
export function MailboxPromptCard({ token }: { token: string }) {
  const titleId = useId();
  const [closed, close] = usePromptClosed(token);
  if (closed) return null;

  const dismiss = () => {
    close();
    // The button is gone: focus moves to the page instead of being lost.
    document.getElementById("fd-main")?.focus({ preventScroll: true });
    // A failed save only means the card may come back on a later visit.
    void fetch("/api/mailbox-prompt/dismiss", { method: "POST", credentials: "same-origin", keepalive: true }).catch(() => {});
  };

  return (
    <section className="fd-card" aria-labelledby={titleId} style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12, padding: 16 }}>
      <div style={{ flex: "1 1 200px", minWidth: 0 }}>
        <h2 id={titleId} className="fd-ct" style={{ margin: 0 }}>{COPY.title}</h2>
        <p className="fd-cm" style={{ margin: "4px 0 0" }}>{COPY.body}</p>
      </div>
      <button type="button" className="fd-btn is-plain" aria-label={COPY.dismissLabel} onClick={dismiss}>{COPY.dismiss}</button>
    </section>
  );
}
