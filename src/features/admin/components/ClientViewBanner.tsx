"use client";

import { useEffect, useRef, useState } from "react";
import { announceViewChange, onViewChange } from "../api/view-channel";

// Where the banner's bottom edge is on screen, for sheets that must stay below it (the phone More
// sheet in globals.css). The banner sits inside the scrolling main area under the top bar and sticks
// to its top, so the edge moves with scrolling: it is measured on load, resize and any scroll.
const EDGE_VAR = "--fd-view-banner-bottom";

// Always visible while an admin views a client. Exit returns to the client list. When another tab
// changes or ends the view, this tab reloads, so the banner always names the client on screen.
export function ClientViewBanner({ name }: { name: string }) {
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => onViewChange(() => window.location.reload()), []);

  useEffect(() => {
    const root = document.documentElement.style;
    const measure = () => {
      if (ref.current) root.setProperty(EDGE_VAR, `${Math.max(0, Math.ceil(ref.current.getBoundingClientRect().bottom))}px`);
    };
    measure();
    window.addEventListener("resize", measure);
    // Scroll does not bubble: capture catches the main area's scroll as well as the page's.
    document.addEventListener("scroll", measure, { capture: true, passive: true });
    // The banner wraps on a narrow screen, and the error line can change its height.
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    if (ref.current) observer?.observe(ref.current);
    return () => {
      window.removeEventListener("resize", measure);
      document.removeEventListener("scroll", measure, { capture: true });
      observer?.disconnect();
      root.removeProperty(EDGE_VAR);
    };
  }, []);

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
      ref={ref}
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
        marginBottom: 16,
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
