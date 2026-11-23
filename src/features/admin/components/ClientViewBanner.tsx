"use client";

import { useEffect, useState } from "react";
import { announceViewChange, onViewChange } from "../api/view-channel";

// Always visible while an admin views a client. Exit returns to the client list. When another tab
// changes or ends the view, this tab reloads, so the banner always names the client on screen.
export function ClientViewBanner({ name }: { name: string }) {
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => onViewChange(() => window.location.reload()), []);

  async function exit() {
    setBusy(true);
    setFailed(false);
    try {
      const response = await fetch("/api/admin/view/exit", { method: "POST" });
      if (!response.ok) throw new Error("exit failed");
      announceViewChange();
      window.location.assign("/admin/clients");
    } catch {
      setFailed(true);
      setBusy(false);
    }
  }

  return (
    <div
      role="status"
      style={{
        position: "sticky",
        top: 0,
        zIndex: 1000,
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 8,
        padding: "8px 16px",
        background: "#1f2933",
        color: "#ffffff",
        fontSize: 14,
      }}
    >
      <span>
        Viewing <strong>{name || "this client"}</strong>. Read-only.
        {failed ? " Could not exit. Try again." : ""}
      </span>
      <button
        type="button"
        onClick={exit}
        disabled={busy}
        style={{ minHeight: 44, padding: "0 16px", background: "#ffffff", color: "#1f2933", border: 0, borderRadius: 6, fontWeight: 600 }}
      >
        {busy ? "Exiting…" : "Exit view"}
      </button>
    </div>
  );
}
