import type { HighLevelUser, SearchUsersQuery } from "@/features/highlevel";

export type InviteEligibility =
  | { eligible: true; hlUserId: string }
  | { eligible: false; reason: "invalid_email" | "not_a_user" | "deleted" | "not_in_location" | "lookup_failed" };

export type InviteCheckDeps = {
  // HighLevel's user search for one sub-account, already holding that tenant's token.
  searchUsers: (query: SearchUsersQuery) => Promise<HighLevelUser[]>;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;
const MAX_EMAIL_LENGTH = 254;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

// An invite is only valid for an email that belongs to a user of that client's sub-account
// (build prompt 4.6). HighLevel's search is fuzzy, so the comparison here is exact (case-insensitive).
// A failed lookup says so and carries no detail: the cause could hold a token.
export async function checkInviteEligibility(
  input: { email: string; companyId: string; locationId: string },
  deps: InviteCheckDeps,
): Promise<InviteEligibility> {
  const email = normalizeEmail(input.email);
  if (email.length > MAX_EMAIL_LENGTH || !EMAIL_PATTERN.test(email)) {
    return { eligible: false, reason: "invalid_email" };
  }
  let users: HighLevelUser[];
  try {
    users = await deps.searchUsers({ companyId: input.companyId, locationId: input.locationId, query: email });
  } catch {
    return { eligible: false, reason: "lookup_failed" };
  }
  const matches = users.filter((u) => normalizeEmail(u.email) === email);
  if (matches.length === 0) return { eligible: false, reason: "not_a_user" };
  const live = matches.filter((u) => !u.deleted);
  if (live.length === 0) return { eligible: false, reason: "deleted" };
  const here = live.find((u) => u.locationIds.length === 0 || u.locationIds.includes(input.locationId));
  if (!here) return { eligible: false, reason: "not_in_location" };
  return { eligible: true, hlUserId: here.id };
}
