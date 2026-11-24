import { PAGE_TEXT_KEY } from "./folder-keys";
import { placeKey } from "./layout";

// What a save needs before the server writes a shown key. The page applies the same rules
// (ProtectedFolder, StepField); this is the server's copy, so a stale tab or a hand-made request
// cannot skip them. "open": any save. "folder": only a save that carries that protected folder's
// unlock (the extra step). "read-only": never through this app (a page's text outside a protected
// folder). Secret keys never get here: the classifier refuses them first.
export type WriteGuard = { kind: "open" } | { kind: "folder"; folder: string } | { kind: "read-only" };

export function writeGuardOf(key: string): WriteGuard {
  const folder = placeKey(key)?.folder;
  if (folder?.protected) return { kind: "folder", folder: folder.id };
  if (PAGE_TEXT_KEY.test(key)) return { kind: "read-only" };
  return { kind: "open" };
}

// The ids a save may name as its unlock.
export const UNLOCK_ID = /^[a-z][a-z0-9-]{0,39}$/;
