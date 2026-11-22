"use client";

import { useShell } from "@/features/app-shell";

// The shell's sign-out (ends the session). Optional in the type: a page rendered alone has none.
type ShellWithSignOut = { signOut?: () => Promise<void> | void };

// Settings "Sign out" (design: st_out). Ends the session through the shell, then loads /sign-in as a
// full page, so no tenant colors, kept page state or cached pages survive into the next sign-in.
export function useSignOut() {
  const shell = useShell() as ShellWithSignOut;
  return async () => {
    try {
      await shell.signOut?.();
    } finally {
      window.location.assign(new URL("/sign-in", window.location.href).href);
    }
  };
}
