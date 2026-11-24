// Shown inside HighLevel's frame when the CRM has no session there: the browser blocked the frame's
// sign-in cookie, or the one-day frame session ended. /sign-in may never be framed (clickjacking), so
// redirecting there leaves a blank frame. Full screen, the CRM is first-party: an existing sign-in is
// used, otherwise /sign-in takes over. Plain markup, like the /embed page.
export function FramedSignedOut() {
  return (
    <main style={{ padding: 24, fontFamily: "system-ui, sans-serif", display: "grid", gap: 12, maxWidth: 420 }}>
      <p role="status">The CRM cannot keep you signed in inside HighLevel. Open it full screen to continue.</p>
      {/* A full page load of HighLevel's whole tab, not a client-side move inside the frame. */}
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
      <a href="/" target="_top" style={{ padding: "12px 16px", minHeight: 44, borderRadius: 8, background: "CanvasText", color: "Canvas", textAlign: "center", textDecoration: "none" }}>
        Open the CRM full screen
      </a>
      <a href="/" target="_blank" rel="noopener noreferrer" style={{ padding: "12px 16px", minHeight: 44, textAlign: "center" }}>
        Open in a new tab
      </a>
    </main>
  );
}
