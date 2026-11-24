"use client";

import { useRef, useState } from "react";

// Turns the check's answer into one sentence. Counts only; never a location id.
export function checkResultMessage(
  status: number,
  body: { connected?: unknown; failures?: unknown; agencies?: unknown; throttled?: unknown; error?: unknown } | null,
): string {
  if (status === 429) return "Checked a moment ago. Wait a minute and try again.";
  if (status === 403 && body?.error === "viewing") return "You are viewing a client. Exit View as client, then check again.";
  if (status !== 200 || !body || typeof body.connected !== "number") return "Could not check HighLevel. Try again.";
  const failures = typeof body.failures === "number" ? body.failures : 0;
  const throttled = typeof body.throttled === "number" ? body.throttled : 0;
  // Every agency was checked less than a minute ago: nothing ran, so say that instead of "no new".
  if (throttled > 0 && body.agencies === 0) return "HighLevel was checked less than a minute ago. Wait a minute and try again.";
  const connected =
    body.connected === 0
      ? "No new sub-accounts with the app installed."
      : `Connected ${body.connected} new sub-account${body.connected === 1 ? "" : "s"}. Reload the page to see ${body.connected === 1 ? "it" : "them"}.`;
  const parts = [connected];
  if (throttled > 0) parts.push(`${throttled} ${throttled === 1 ? "agency was" : "agencies were"} checked less than a minute ago and skipped.`);
  if (failures > 0) parts.push(`${failures} step${failures === 1 ? "" : "s"} failed; the server log has the details.`);
  return parts.join(" ");
}

// Admin only (the route checks the session). Connects every sub-account HighLevel lists as having
// the app installed that the CRM does not know yet. Never other sub-accounts of the agency.
export function CheckSubAccountsButton() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  // Blocks a second click that lands before React has rendered the disabled button.
  const busyRef = useRef(false);

  async function check() {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/sub-accounts/check", { method: "POST" });
      const body = (await response.json().catch(() => null)) as Parameters<typeof checkResultMessage>[1];
      setMessage(checkResultMessage(response.status, body));
    } catch {
      setMessage("Could not reach the server. Check your connection and try again.");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  return (
    <p>
      <button type="button" onClick={check} disabled={busy}>
        {busy ? "Checking..." : "Check for new sub-accounts"}
      </button>{" "}
      {message ? <span role="status">{message}</span> : null}
    </p>
  );
}
