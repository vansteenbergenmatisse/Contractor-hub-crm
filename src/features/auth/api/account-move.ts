import type { Role } from "../types";

// Moving a never-used account to the client HighLevel proves the person belongs to (docs/onboarding.md,
// decision 3, option c). Fails closed: anything that is not proven means "stay, and log a conflict".
//
// "Never used" is a positive proof. Better Auth may delete expired sessions, and a set-password link
// leaves no trace, so a missing session proves nothing. A marker row is written when the sync creates
// an account, holding a fingerprint of its random first password. The session-create hook deletes
// the marker first. That can fail without blocking sign-in, so a move also refuses on any session row
// and on a password that no longer matches the fingerprint. Accounts without a marker (all accounts older than the marker,
// invited accounts) count as used.
export type MoveReason =
  | "no_proof" | "admin_account" | "unprovable" | "used" | "disabled" | "raced" | "link_taken"
  | "target_not_connected" | "source_still_lists" | "source_unreadable" | "move_failed";

export type AccountSnapshot = {
  role: Role;
  tenantId: string | null;
  disabledAt: Date | null;
  linkDeletedAt: Date | null;
  marker: { tenantId: string; credentialFingerprint: string } | null;
  credentials: Array<{ providerId: string; passwordFingerprint: string | null }>;
  sessionCount: number;
};

// A complete list, or an honest "this read does not prove anything".
export type SourceList = { complete: true; emails: ReadonlySet<string> } | { complete: false };

// What proves the person belongs to the new client (a HighLevel-signed sign-in, or the sync's list),
// plus the read that proves the old client let go. Both are needed: otherwise a client admin could
// pull an account out of another client by adding its address in HighLevel. No proof, no move.
export type MoveProof = { kind: "embed" | "sync"; readSourceEmails(tenantId: string): Promise<SourceList> };

// The real read of the old client, for now. A missing address proves nothing unless the list is known
// to be complete, and today it is not: `GET /users/` has no documented paging, the `/users/search`
// fallback stops silently at its page limit, and unparsable rows are dropped. So nothing moves until
// `src/features/highlevel` can report a complete list.
export const readSourceUnproven: MoveProof["readSourceEmails"] = async () => ({ complete: false });

export type MoveInput = { userId: string; fromTenantId: string; toTenantId: string; ghlUserId: string; role: Extract<Role, "owner" | "office"> };

export type MoveStore = {
  readSnapshot(userId: string): Promise<AccountSnapshot | null>;
  markUnused(userId: string, tenantId: string): Promise<void>;
  // One transaction: locks the user, runs `verify` on fresh data, then moves. Returns why it did not.
  moveInTransaction(input: MoveInput, verify: (snapshot: AccountSnapshot, fromTenantId: string) => MoveReason | null): Promise<"moved" | MoveReason>;
};

// Null means proven unused and movable out of `fromTenantId`.
export function judgeUnused(snapshot: AccountSnapshot, fromTenantId: string): MoveReason | null {
  if (snapshot.role === "admin" || snapshot.tenantId === null) return "admin_account";
  if (snapshot.tenantId !== fromTenantId) return "raced";
  if (!snapshot.marker || snapshot.marker.tenantId !== fromTenantId) return "unprovable";
  if (snapshot.credentials.length === 0) return "unprovable";
  if (snapshot.credentials.length > 1) return "used";
  const [credential] = snapshot.credentials;
  if (credential.providerId !== "credential" || credential.passwordFingerprint !== snapshot.marker.credentialFingerprint) return "used";
  if (snapshot.sessionCount > 0) return "used";
  // Any block stays put, whoever set it: a move never re-enables an account.
  if (snapshot.disabledAt || snapshot.linkDeletedAt) return "disabled";
  return null;
}

function errorName(error: unknown): string {
  return error instanceof Error ? error.name : "unknown error";
}

// Reason codes only: no email, no ids, no names.
function auditMove(path: MoveProof["kind"], result: "moved" | MoveReason): void {
  const line = result === "moved"
    ? { audit: "account_move", outcome: "moved", path }
    : { audit: "account_move", outcome: "conflict", path, reason: result };
  console.info(JSON.stringify(line));
}

async function decide(moves: MoveStore, proof: MoveProof, input: MoveInput, email: string): Promise<"moved" | MoveReason> {
  let snapshot: AccountSnapshot | null;
  try {
    snapshot = await moves.readSnapshot(input.userId);
  } catch (error) {
    console.error(`Account move: proof step failed: ${errorName(error)}`);
    return "unprovable";
  }
  if (!snapshot) return "unprovable";
  const refused = judgeUnused(snapshot, input.fromTenantId);
  if (refused) return refused;
  // An empty list is more likely a HighLevel problem than a real answer.
  let source: SourceList;
  try {
    source = await proof.readSourceEmails(input.fromTenantId);
  } catch (error) {
    console.error(`Account move: source read failed: ${errorName(error)}`);
    return "source_unreadable";
  }
  if (!source.complete || source.emails.size === 0) return "source_unreadable";
  if (source.emails.has(email)) return "source_still_lists";
  try {
    return await moves.moveInTransaction(input, judgeUnused);
  } catch (error) {
    console.error(`Account move: transaction failed: ${errorName(error)}`);
    return "move_failed";
  }
}

export async function tryMoveAccount(
  moves: MoveStore | undefined,
  proof: MoveProof | undefined,
  existing: { id: string; role: Role; tenantId: string | null },
  target: { tenantId: string; ghlUserId: string; role: Extract<Role, "owner" | "office">; email: string; mayRestore?: boolean },
): Promise<"moved" | MoveReason> {
  if (existing.role === "admin" || existing.tenantId === null) {
    if (proof) auditMove(proof.kind, "admin_account");
    return "admin_account";
  }
  // The on-visit sync (mayRestore false) never moves anyone, whatever it was handed.
  if (!moves || !proof || target.mayRestore === false) return "no_proof";
  const result = await decide(moves, proof, {
    userId: existing.id,
    fromTenantId: existing.tenantId,
    toTenantId: target.tenantId,
    ghlUserId: target.ghlUserId,
    role: target.role,
  }, target.email);
  auditMove(proof.kind, result);
  return result;
}
