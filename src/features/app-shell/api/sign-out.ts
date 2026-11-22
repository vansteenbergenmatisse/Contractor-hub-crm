// Ends the session and leaves with a full page load of /sign-in: no router cache, kept page state or
// live brand colors of this tenant survive into the next sign-in in this tab. Phase 2's only fetch.
export async function signOut(): Promise<void> {
  try {
    await fetch("/api/auth/sign-out", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  } finally {
    window.location.assign(new URL("/sign-in", window.location.href).href);
  }
}
