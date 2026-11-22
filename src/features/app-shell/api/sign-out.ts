// Ends the session and leaves with a full page load of /sign-in: no router cache, kept page state or
// live brand colors of this tenant survive into the next sign-in in this tab. Phase 2's only fetch.
// If the server did not end the session (an error answer or no network) the page stays, so the
// next person on this device is never left signed in behind a sign-in form; the caller says so.
export async function signOut(): Promise<void> {
  const res = await fetch("/api/auth/sign-out", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  if (!res.ok) throw new Error("Sign-out failed");
  window.location.assign(new URL("/sign-in", window.location.href).href);
}
