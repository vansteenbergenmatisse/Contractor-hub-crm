"use client";

import { useState } from "react";
import type { ClientRow } from "../types";

// Plain styling on purpose (build prompt section 4.8). All text states are words, not colors.
export function ClientsTable({ clients }: { clients: ClientRow[] }) {
  const [rows, setRows] = useState(clients);
  const [message, setMessage] = useState<string | null>(null);
  const [inviteFor, setInviteFor] = useState<string | null>(null);
  const [email, setEmail] = useState("");

  async function post(url: string, body: unknown): Promise<Response> {
    return fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  }

  async function setLogin(tenantId: string, disabled: boolean) {
    setMessage(null);
    const response = await post(`/api/admin/clients/${encodeURIComponent(tenantId)}/login`, { disabled });
    if (!response.ok) return setMessage("Could not change login. Try again.");
    setRows((current) =>
      current.map((row) => (row.tenantId === tenantId && row.login !== "no users" ? { ...row, login: disabled ? "off" : "on" } : row)),
    );
  }

  async function invite(tenantId: string) {
    setMessage(null);
    const response = await post("/api/admin/invites", { tenantId, email, role: "owner" });
    if (!response.ok) return setMessage("The invite was not created. Check the email and that the client is connected.");
    const { link } = (await response.json()) as { link: string };
    setMessage(`Invite link (send it to the owner, it works once for 72 hours): ${link}`);
    setInviteFor(null);
    setEmail("");
  }

  async function copyLink(path: string) {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${path}`);
      setMessage("Link copied.");
    } catch {
      setMessage("Could not copy. Select the link and copy it by hand.");
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
      {message ? <p role="status">{message}</p> : null}
      {rows.length === 0 ? <p>No clients yet. A client appears here after the app is installed on their sub-account.</p> : null}
      {rows.length > 0 ? (
        <table>
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
              <tr key={row.tenantId}>
                <td>{row.name}</td>
                <td>{row.status}</td>
                <td>{row.users}</td>
                <td>{row.login}</td>
                <td>
                  {row.signInPath ? (
                    <>
                      <code>{row.signInPath}</code>{" "}
                      <button type="button" aria-label={`Copy sign-in link for ${row.name}`} onClick={() => copyLink(row.signInPath as string)}>
                        Copy
                      </button>
                    </>
                  ) : (
                    "Not available yet"
                  )}
                </td>
                <td>
                  {inviteFor === row.tenantId ? (
                    <>
                      <input
                        type="email"
                        aria-label={`Owner email for ${row.name}`}
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                      />{" "}
                      <button type="button" onClick={() => invite(row.tenantId)} disabled={email.trim() === ""}>
                        Create invite
                      </button>{" "}
                      <button type="button" onClick={() => setInviteFor(null)}>Cancel</button>
                    </>
                  ) : (
                    <>
                      <button type="button" onClick={() => setInviteFor(row.tenantId)}>Invite owner</button>{" "}
                      {row.login === "off" ? (
                        <button type="button" onClick={() => setLogin(row.tenantId, false)}>Turn on login</button>
                      ) : (
                        <button type="button" onClick={() => setLogin(row.tenantId, true)} disabled={row.login === "no users"}>
                          Turn off login
                        </button>
                      )}
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </main>
  );
}
