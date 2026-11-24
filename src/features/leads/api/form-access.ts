import { isLeadsCreateEnabled } from "./create-flag";

// What the lead form may do for this signed-in person. Decided on the server; the routes check again.
export type LeadFormAccess = { canSave: boolean; addressSearch: boolean };
type FormUser = { role: string; tenantId: string | null; viewing?: boolean };
type FlagEnv = Record<string, string | undefined>;

export const NO_FORM_ACCESS: LeadFormAccess = { canSave: false, addressSearch: false };

export function leadFormAccess(user: FormUser | null | undefined, env: FlagEnv = process.env): LeadFormAccess {
  if (!user?.tenantId || user.viewing || (user.role !== "owner" && user.role !== "office")) return NO_FORM_ACCESS;
  return { canSave: isLeadsCreateEnabled(user.tenantId, env), addressSearch: !!env.GOOGLE_MAPS_SERVER_KEY?.trim() };
}
