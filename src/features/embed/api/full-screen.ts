// Continue full-screen after the /embed sign-in inside HighLevel's frame. The handoff token goes in the
// fragment of /device-sign-in (the auth feature's redeem page; the path is repeated here because this
// runs in the browser and must not pull the auth feature's server code into the bundle).
export const FULL_SCREEN_PATH = "/device-sign-in";

export const fullScreenUrl = (origin: string, token: string) => `${origin.replace(/\/+$/, "")}${FULL_SCREEN_PATH}#t=${token}`;

type TopWindow = { location: { href: string } } | null;

// Try to move the whole browser tab (HighLevel's top window) to the CRM. HighLevel's docs do not say
// whether its frame allows that (sandbox, browser rules on navigation without a tap), so a refusal is
// normal: it returns false and the page shows "Open full screen" for a tap instead.
export function tryTopNavigation(top: TopWindow, self: unknown, url: string): boolean {
  if (!top || top === self) return false;
  try {
    top.location.href = url;
    return true;
  } catch {
    return false;
  }
}
