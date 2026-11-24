"use client";

import { Fragment, useRef, useState } from "react";
import { inviteErrorMessage } from "../api/invite-errors";
import { issuedLinkMessage } from "../api/sign-in-messages";
import { announceViewChange } from "../api/view-channel";
import type { ClientRow } from "../types";
import { CheckSubAccountsButton } from "./CheckSubAccountsButton";
import { ClientUsers } from "./ClientUsers";

// Plain styling on purpose (build prompt section 4.8). All text states are words, not colors.
export function ClientsTable({ clients }: { clients: ClientRow[] }) {
  const [rows, setRows] = useState(clients);
  // `link` is a one-time link (invite or set-password) shown under the client with a Copy button.
  const [message, setMessage] = useState<{ tenantId: string; text: string; link?: string; note?: string } | null>(null);
  const [usersFor, setUsersFor] = useState<string | null>(null);
  const [inviteFor, setInviteFor] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState<ReadonlySet<string>>(new Set());
  // The ref blocks a second click that lands before React has rendered the disabled button.
  const pendingRef = useRef(new Set<string>());

  async function withRow(tenantId: string, action: () => Promise<void>) {
    if (pendingRef.current.has(tenantId)) return;
    pendingRef.current.add(tenantId);
    setPending(new Set(pendingRef.current));
    setMessage(null);
    try {
      await action();
    } catch {
      setMessage({ tenantId, text: "Could not reach the server. Check your connection and try again." });
    } finally {
      pendingRef.current.delete(tenantId);
      setPending(new Set(pendingRef.current));
    }
  }

  async function post(url: string, body: unknown): Promise<Response> {
    return fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  }

  function setLogin(tenantId: string, disabled: boolean) {
    return withRow(tenantId, async () => {
      const response = await post(`/api/admin/clients/${encodeURIComponent(tenantId)}/login`, { disabled });
      if (!response.ok) return setMessage({ tenantId, text: "Could not change login. Try again." });
      setRows((current) =>
        current.map((row) => (row.tenantId === tenantId ? { ...row, login: disabled ? "off" : row.users === 0 ? "no users" : "on" } : row)),
      );
      const body = (await response.json().catch(() => null)) as { removedCheck?: string } | null;
      if (!disabled && body?.removedCheck === "failed") {
        setMessage({ tenantId, text: "Login is on, but we could not check for people removed from HighLevel. Someone removed may still have access." });
      }
    });
  }

  function invite(tenantId: string) {
    return withRow(tenantId, async () => {
      const response = await post("/api/admin/invites", { tenantId, email, role: "owner" });
      const body = (await response.json().catch(() => null)) as { link?: string; email?: string; mail?: string; kind?: string; error?: string } | null;
      if (!response.ok) return setMessage({ tenantId, text: inviteErrorMessage(body?.error) });
      setInviteFor(null);
      setEmail("");
      // The invite exists at this point, so a retry would create a second live one.
      const text = issuedLinkMessage(body);
      if (!text || typeof body?.link !== "string") return setMessage({ tenantId, text: "The invite was created, but its link could not be shown." });
      setMessage({ tenantId, text, link: body.link });
    });
  }

  async function copied(value: string): Promise<boolean> {
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch {
      return false;
    }
  }

  // The CRM tenant id is what the per-client env flags (SETTINGS_WRITE_BACK_TENANTS and the like) take.
  async function copyTenantId(tenantId: string) {
    const ok = await copied(tenantId);
    setMessage({ tenantId, text: ok ? "Tenant id copied." : "Could not copy. Select the id and copy it by hand." });
  }

  // Keeps the one-time link on screen and adds a note under it.
  async function copyShownLink(tenantId: string, link: string) {
    const ok = await copied(link);
    setMessage((current) =>
      current?.tenantId === tenantId && current.link === link
        ? { ...current, note: ok ? "Link copied." : "Could not copy. Select the link and copy it by hand." }
        : current,
    );
  }

  function viewClient(tenantId: string) {
    return withRow(tenantId, async () => {
      try {
        const response = await fetch(`/api/admin/clients/${encodeURIComponent(tenantId)}/view`, { method: "POST" });
        if (!response.ok) return setMessage({ tenantId, text: "Could not open this client. Try again." });
        announceViewChange();
        window.location.assign("/");
      } catch {
        setMessage({ tenantId, text: "Could not open this client. Try again." });
      }
    });
  }

  async function copyLink(tenantId: string, path: string) {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${path}`);
      setMessage({ tenantId, text: "Link copied." });
    } catch {
      setMessage({ tenantId, text: "Could not copy. Select the link and copy it by hand." });
    }
  }

  return (
    <main style={{ padding: 24, fontFamily: "system-ui, sans-serif" }}>
      <h1>Clients</h1>
      <p>
        {/* A plain anchor on purpose: this route redirects off-site, so it needs a full page load. */}
        <a className="fd-btn" href="/api/integrations/oauth/start" style={{ textDecoration: "none" }}>
          Connect sub-accounts
        </a>{" "}
        <span>In production, select all sub-accounts so new clients connect automatically.</span>
      </p>
      <CheckSubAccountsButton />
      {message && !rows.some((row) => row.tenantId === message.tenantId) ? <p role="status">{message.text}</p> : null}
      {rows.length === 0 ? <p>No clients yet. A client appears here after the app is installed on their sub-account.</p> : null}
      {rows.length > 0 ? (
        <div role="region" aria-label="Clients table" tabIndex={0} style={{ overflowX: "auto" }}>
        <table style={{ borderSpacing: "16px 8px" }}>
          <thead>
            <tr>
              <th align="left">Client</th>
              <th align="left">Status</th>
              <th align="left">Users</th>
              <th align="left">Login</th>
              <th align="left">Sign-in link</th>
              <th align="left">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <Fragment key={row.tenantId}>
                <tr>
                  <td>
                    <span>{row.name}</span>
                    {/* The per-client env flags (SETTINGS_WRITE_BACK_TENANTS and the like) take this id, not the HighLevel location id. */}
                    <div>
                      <small>
                        CRM tenant id <code>{row.tenantId}</code>{" "}
                        <button type="button" aria-label={`Copy CRM tenant id for ${row.name}`} onClick={() => copyTenantId(row.tenantId)}>
                          Copy id
                        </button>
                      </small>
                    </div>
                  </td>
                  <td>{row.status}</td>
                  <td>{row.users}</td>
                  <td>{row.login}</td>
                  <td>
                    {row.signInPath ? (
                      <>
                        <code>{row.signInPath}</code>{" "}
                        <button type="button" aria-label={`Copy sign-in link for ${row.name}`} onClick={() => copyLink(row.tenantId, row.signInPath as string)}>
                          Copy
                        </button>
                      </>
                    ) : (
                      "Not available yet"
                    )}
                  </td>
                  <td>
                    {inviteFor === row.tenantId ? (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
                        <input
                          type="email"
                          aria-label={`Owner email for ${row.name}`}
                          value={email}
                          onChange={(event) => setEmail(event.target.value)}
                        />
                        <button type="button" onClick={() => invite(row.tenantId)} disabled={email.trim() === "" || pending.has(row.tenantId)}>
                          {pending.has(row.tenantId) ? "Creating invite..." : "Create invite"}
                        </button>
                        <button
                          type="button"
                          disabled={pending.has(row.tenantId)}
                          onClick={() => {
                            setEmail("");
                            setInviteFor(null);
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
                        {row.status !== "Uninstalled" ? (
                          <button type="button" aria-label={`View ${row.name} as client, read-only`} disabled={pending.has(row.tenantId)} onClick={() => viewClient(row.tenantId)}>
                            View client
                          </button>
                        ) : null}
                        <button
                          type="button"
                          disabled={pending.has(row.tenantId)}
                          onClick={() => {
                            setEmail("");
                            setInviteFor(row.tenantId);
                          }}
                        >
                          Invite owner
                        </button>
                        <button
                          type="button"
                          aria-expanded={usersFor === row.tenantId}
                          aria-label={`${usersFor === row.tenantId ? "Hide" : "Show"} users and sign-in emails for ${row.name}`}
                          onClick={() => setUsersFor((current) => (current === row.tenantId ? null : row.tenantId))}
                        >
                          {usersFor === row.tenantId ? "Hide users" : "Users"}
                        </button>
                        {row.login === "off" ? (
                          <button type="button" disabled={pending.has(row.tenantId)} onClick={() => setLogin(row.tenantId, false)}>Turn on login</button>
                        ) : (
                          <button type="button" onClick={() => setLogin(row.tenantId, true)} disabled={pending.has(row.tenantId)}>
                            Turn off login
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
                {message?.tenantId === row.tenantId ? (
                  <tr>
                    <td colSpan={6}>
                      <p role="status" style={{ margin: 0, overflowWrap: "anywhere" }}>
                        {message.text}
                        {message.link ? (
                          <>
                            {" "}
                            <code>{message.link}</code>
                          </>
                        ) : null}
                        {message.note ? ` ${message.note}` : null}
                      </p>
                      {message.link ? (
                        <button type="button" aria-label={`Copy the link for ${row.name}`} onClick={() => copyShownLink(row.tenantId, message.link as string)}>
                          Copy link
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ) : null}
                {usersFor === row.tenantId ? (
                  <tr>
                    <td colSpan={6}>
                      <ClientUsers
                        tenantId={row.tenantId}
                        clientName={row.name}
                        onResult={(result) => setMessage({ tenantId: row.tenantId, ...result })}
                      />
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            ))}
          </tbody>
        </table>
        </div>
      ) : null}
    </main>
  );
}
