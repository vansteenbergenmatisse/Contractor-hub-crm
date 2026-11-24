"use client";

import { useState } from "react";
import type { AdminValueRow, AdminValuesView } from "../types";

// Admin only. Plain styling on purpose, like the clients table. Every custom value of one client,
// grouped like the owner's Settings page, each with an edit box, Save, and Lock or Unlock.
const STATUS_TEXT: Record<string, string> = {
  saved: "Saved.",
  unchanged: "Already this value.",
  invalid: "Not saved. Check the value.",
  missing: "Not saved. This value no longer exists in HighLevel.",
  duplicate: "Not saved. This key is listed twice in HighLevel.",
  denied: "Not saved. This value cannot be changed here.",
  rejected: "HighLevel refused this value.",
  permission: "Not saved. The client's connection needs attention.",
  retry: "Not saved. Try again.",
  unknown: "Could not confirm the save. Reload this page to see what HighLevel holds.",
  busy: "Another save for this client is running. Try again in a moment.",
};

const LOAD_ERROR = {
  permission: "Could not read this client's values: the connection needs attention.",
  retry: "Could not read this client's values. Reload to try again.",
};

type RowState = { saved: string; draft: string; locked: boolean; message?: string; pending?: boolean };

function post(tenantId: string, body: unknown): Promise<Response> {
  return fetch(`/api/admin/clients/${encodeURIComponent(tenantId)}/values`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}

function ValueRow({ row, tenantId, writable }: { row: AdminValueRow; tenantId: string; writable: boolean }) {
  const [state, setState] = useState<RowState>({ saved: row.value ?? "", draft: row.value ?? "", locked: row.locked });
  const id = `av-${row.key}`;
  const canEdit = writable && row.editable;
  const dirty = state.draft.trim() !== state.saved.trim();
  const patch = (next: Partial<RowState>) => setState((current) => ({ ...current, ...next }));

  // Buttons are never `disabled` while working or when there is nothing to save: a disabled button
  // drops keyboard focus to the page. `aria-disabled` says it, and the handlers ignore the click.
  const saveOff = !dirty || !!state.pending;

  async function save() {
    if (saveOff) return;
    const emptied = state.draft.trim() === "";
    patch({ pending: true, message: undefined });
    try {
      const response = await post(tenantId, { action: "save", key: row.key, expected: state.saved, value: state.draft });
      if (response.status === 409) return patch({ message: "Saving to this client is off. Nothing was written." });
      if (response.status === 429) return patch({ message: "Too many changes. Try again later." });
      if (!response.ok) return patch({ message: "Not saved. Try again." });
      const body = (await response.json()) as { results?: { status: string; current?: string }[] };
      const result = body.results?.[0];
      if (!result) return patch({ message: "Not saved. Try again." });
      if (result.status === "saved" || result.status === "unchanged") return patch({ saved: state.draft.trim(), draft: state.draft.trim(), message: STATUS_TEXT[result.status] });
      if (result.status === "conflict") return patch({ message: `Not saved. HighLevel now holds ${result.current?.trim() ? result.current : "an empty value"}. Reload and try again.` });
      if (result.status === "invalid" && emptied) return patch({ message: "Not saved. This value cannot be empty." });
      patch({ message: STATUS_TEXT[result.status] ?? "Not saved. Try again." });
    } catch {
      patch({ message: "Could not reach the server. Try again." });
    } finally {
      patch({ pending: false });
    }
  }

  async function toggleLock() {
    if (state.pending) return;
    const action = state.locked ? "unlock" : "lock";
    patch({ pending: true, message: undefined });
    try {
      const response = await post(tenantId, { action, key: row.key });
      if (!response.ok) return patch({ message: `Could not ${action}. Try again.` });
      patch({ locked: action === "lock", message: action === "lock" ? "Locked. The owner sees it read-only." : "Unlocked. The owner can change it." });
    } catch {
      patch({ message: "Could not reach the server. Try again." });
    } finally {
      patch({ pending: false });
    }
  }

  const name = (
    <>
      <strong>{row.label}</strong> <code style={{ overflowWrap: "anywhere" }}>{row.key}</code>
    </>
  );

  return (
    <li style={{ marginBottom: 16 }}>
      {row.value === null ? <div>{name}</div> : <label htmlFor={id}>{name}</label>}
      <div>
        {row.value === null ? (
          <p>Too long to edit here. Change it in HighLevel.</p>
        ) : (
          <textarea id={id} rows={row.value.length > 80 ? 4 : 1} value={state.draft} readOnly={!canEdit} onChange={(event) => patch({ draft: event.target.value })} style={{ width: "100%", maxWidth: 480, boxSizing: "border-box" }} />
        )}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
        {canEdit ? (
          <button type="button" aria-label={`Save ${row.label}`} aria-disabled={saveOff} onClick={save}>
            {state.pending ? "Saving..." : "Save"}
          </button>
        ) : null}
        {row.secret ? (
          <span>Secret: always hidden from the owner</span>
        ) : row.ownerReadOnly && !state.locked ? (
          <span>Owner sees it read-only</span>
        ) : (
          <>
            <span>{state.locked ? "Locked" : "Owner can change"}</span>
            <button type="button" aria-label={`${state.locked ? "Unlock" : "Lock"} ${row.label}`} aria-disabled={!!state.pending} onClick={toggleLock}>
              {state.locked ? "Unlock" : "Lock"}
            </button>
          </>
        )}
        {row.editable ? null : row.value === null ? null : <span>Read-only here (listed twice in HighLevel or an unusual key name)</span>}
      </div>
      <p role="status">{state.message ?? ""}</p>
    </li>
  );
}

export function AdminValuesPage({ view }: { view: AdminValuesView }) {
  return (
    <main style={{ padding: 24, fontFamily: "system-ui, sans-serif" }}>
      <p><a href="/admin/clients">Back to clients</a></p>
      <h1>Values for {view.clientName || view.tenantId}</h1>
      <p>Every custom value of this client, including secret ones. Only Forge Forward admins see this page. A locked value is read-only for the owner.</p>
      {view.writable ? null : (
        <p role="note"><strong>Saving to this client is off</strong> (write-back is off or this client is excluded). Values are read-only here. Locks still work.</p>
      )}
      {view.loadError === "pending_update" ? (
        <p role="alert">Database update pending: {view.pendingMigration} is not applied on this environment. <a href="/admin/migrations">See migrations</a></p>
      ) : view.loadError ? <p role="alert">{LOAD_ERROR[view.loadError]}</p> : null}
      {view.folders.map((folder) => (
        <section key={folder.id} aria-labelledby={`af-${folder.id}`}>
          <h2 id={`af-${folder.id}`}>{folder.title}</h2>
          {folder.groups.map((group) => (
            <div key={group.id}>
              {folder.groups.length > 1 ? <h3>{group.title}</h3> : null}
              <ul style={{ listStyle: "none", padding: 0 }}>
                {group.rows.map((row) => <ValueRow key={row.key} row={row} tenantId={view.tenantId} writable={view.writable} />)}
              </ul>
            </div>
          ))}
        </section>
      ))}
    </main>
  );
}
