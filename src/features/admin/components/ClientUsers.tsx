"use client";

import { useEffect, useRef, useState } from "react";
import { inviteErrorMessage, SIGN_IN_EMAIL_FALLBACK } from "../api/invite-errors";
import { issuedLinkMessage } from "../api/sign-in-messages";

type AccountState = "never_signed_in" | "signed_in" | "login_off" | "unproven";
type Account = { userId: string; name: string; email: string; role: "owner" | "office"; state: AccountState };

const STATE_TEXT: Record<AccountState, string> = {
  never_signed_in: "Never signed in",
  signed_in: "Has signed in",
  login_off: "Login off",
  unproven: "Cannot tell (older account)",
};

// The users of one client, with a "Send sign-in email" for each person who never signed in. The result
// (and the one-time link) goes to the client's status line through `onResult`.
export function ClientUsers({
  tenantId,
  clientName,
  onResult,
}: {
  tenantId: string;
  clientName: string;
  onResult: (result: { text: string; link?: string }) => void;
}) {
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sending, setSending] = useState<string | null>(null);
  const sendingRef = useRef<string | null>(null);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const response = await fetch(`/api/invites/sign-in-email?tenantId=${encodeURIComponent(tenantId)}`);
        const body = (await response.json().catch(() => null)) as { users?: Account[]; error?: string } | null;
        if (!live) return;
        if (!response.ok || !Array.isArray(body?.users)) return setLoadError("Could not load the users of this client. Try again.");
        setAccounts(body.users);
      } catch {
        if (live) setLoadError("Could not reach the server. Check your connection and try again.");
      }
    })();
    return () => {
      live = false;
    };
  }, [tenantId]);

  async function send(account: Account) {
    if (sendingRef.current) return;
    sendingRef.current = account.userId;
    setSending(account.userId);
    try {
      const response = await fetch("/api/invites/sign-in-email", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tenantId, userId: account.userId }),
      });
      const body = (await response.json().catch(() => null)) as { link?: string; email?: string; mail?: string; kind?: string; error?: string } | null;
      if (!response.ok) return onResult({ text: inviteErrorMessage(body?.error, SIGN_IN_EMAIL_FALLBACK) });
      const text = issuedLinkMessage(body);
      if (!text || typeof body?.link !== "string") return onResult({ text: "A link was made, but it could not be shown. Try again to make a new one." });
      onResult({ text, link: body.link });
    } catch {
      onResult({ text: "Could not reach the server. Check your connection and try again." });
    } finally {
      sendingRef.current = null;
      setSending(null);
    }
  }

  if (loadError) return <p style={{ margin: 0 }}>{loadError}</p>;
  if (!accounts) return <p style={{ margin: 0 }}>Loading users...</p>;
  if (accounts.length === 0) return <p style={{ margin: 0 }}>No users yet. Users appear after the sync reads them from HighLevel.</p>;
  return (
    <table aria-label={`Users of ${clientName}`} style={{ borderSpacing: "12px 4px" }}>
      <thead>
        <tr>
          <th align="left">Name</th>
          <th align="left">Email</th>
          <th align="left">Role</th>
          <th align="left">Sign-in</th>
          <th align="left">Action</th>
        </tr>
      </thead>
      <tbody>
        {accounts.map((account) => (
          <tr key={account.userId}>
            <td>{account.name}</td>
            <td style={{ overflowWrap: "anywhere" }}>{account.email}</td>
            <td>{account.role === "owner" ? "Owner" : "Office"}</td>
            <td>{STATE_TEXT[account.state] ?? STATE_TEXT.unproven}</td>
            <td>
              {account.state === "never_signed_in" ? (
                <button
                  type="button"
                  aria-label={`Send sign-in email to ${account.name}`}
                  disabled={sending !== null}
                  onClick={() => send(account)}
                >
                  {sending === account.userId ? "Sending..." : "Send sign-in email"}
                </button>
              ) : (
                account.state === "login_off" ? "Not available" : "They use Forgot password"
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
