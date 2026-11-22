import type { Business } from "../types";

const initials = (words: string[]): string => ((words[0]?.[0] ?? "") + (words[1]?.[0] ?? "")).trim().toUpperCase();

// What the frame shows about the business and the signed-in person: name, owner and tag line.
// Inputs come from the sub-account's custom values (or the mock set in Phase 2); every field has a
// plain fallback so an empty value never breaks the frame.
export function buildBusiness(input: { name?: string | null; owner?: string | null; keyword?: string | null; city?: string | null; state?: string | null }): Business {
  const name = input.name?.trim() || "Your business";
  const owner = input.owner?.trim() || "Owner";
  const place = [input.city?.trim(), input.state?.trim()].filter(Boolean).join(", ");
  const tag = [input.keyword?.trim(), place].filter(Boolean).join(" · ");
  return {
    name,
    init: initials(name.split(/\s+/)),
    tag,
    owner,
    ownerInit: initials(owner.split(/\s+/)),
    first: owner.split(/\s+/)[0],
  };
}
