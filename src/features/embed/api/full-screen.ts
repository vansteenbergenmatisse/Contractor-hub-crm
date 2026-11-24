// Continue full-screen after the /embed sign-in inside HighLevel's frame. The handoff token goes in the
// fragment of /device-sign-in (the auth feature's redeem page; the path is repeated here because this
// runs in the browser and must not pull the auth feature's server code into the bundle).
export const FULL_SCREEN_PATH = "/device-sign-in";

export const fullScreenUrl = (origin: string, token: string) => `${origin.replace(/\/+$/, "")}${FULL_SCREEN_PATH}#t=${token}`;

export type TopWindow = { location: { href: string; replace?: (url: string) => void } } | null;

// Try to move the whole browser tab (HighLevel's top window) to the CRM. HighLevel's docs do not say
// whether its frame allows that (sandbox, browser rules on navigation without a tap), so a refusal is
// normal: it returns false and the page shows "Open full screen" for a tap instead.
// location.replace (which a cross-origin frame may call) swaps HighLevel's CRM page in the history for
// the CRM, so Back does not land on a page that jumps forward again. Setting `href` is only the
// fallback for a window object without replace.
export function tryTopNavigation(top: TopWindow, self: unknown, url: string): boolean {
  if (!top || top === self) return false;
  try {
    if (typeof top.location.replace === "function") top.location.replace(url);
    else top.location.href = url;
    return true;
  } catch {
    return false;
  }
}

export type TabStorage = Pick<Storage, "getItem" | "setItem">;

const AUTO_JUMP_KEY = "crm.embed.autoJumped";

// The automatic jump happens at most once per browser tab (sessionStorage is per tab). When the person
// comes back to HighLevel's CRM page in the same tab, /embed shows the buttons instead, so
// "Use it here, inside HighLevel" stays reachable and nothing loops. Without usable storage the page
// cannot remember the jump, so it does not jump at all and only shows the buttons.
export function claimAutoJump(storage: TabStorage | null): boolean {
  if (!storage) return false;
  try {
    if (storage.getItem(AUTO_JUMP_KEY)) return false;
    storage.setItem(AUTO_JUMP_KEY, "1");
    return storage.getItem(AUTO_JUMP_KEY) === "1";
  } catch {
    return false;
  }
}
