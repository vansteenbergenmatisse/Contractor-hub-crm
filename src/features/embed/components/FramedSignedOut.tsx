// Shown inside HighLevel's frame when the CRM has no session there: the browser blocked the frame's
// sign-in cookie, or the one-day frame session ended. /sign-in may never be framed (clickjacking), and
// sending the frame to / would only land on /sign-in again. The main action loads /embed in this same
// frame, which runs the in-frame sign-in again: Chrome signs in silently, Safari then offers the
// full-screen handoff. Full screen stays as the second way. Plain markup, like the /embed page.
export function FramedSignedOut() {
  return (
    <main style={{ padding: 24, fontFamily: "system-ui, sans-serif", display: "grid", gap: 12, maxWidth: 420 }}>
      <h1 style={{ fontSize: 20, margin: 0 }}>Your sign-in ended.</h1>
      <p style={{ margin: 0 }}>Tap below to sign in again.</p>
      {/* A full page load of this frame, so the /embed sign-in runs from the start. */}
      <a href="/embed" style={{ padding: "12px 16px", minHeight: 44, borderRadius: 8, background: "CanvasText", color: "Canvas", textAlign: "center", textDecoration: "none" }}>
        Sign in again
      </a>
      {/* A full page load of HighLevel's whole tab, not a client-side move inside the frame. */}
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
      <a href="/" target="_top" style={{ padding: "12px 16px", minHeight: 44, textAlign: "center" }}>
        Open the CRM full screen
      </a>
    </main>
  );
}
