// Public API of the auth feature. Other code imports from "@/features/auth" only.
export { ROLES, isRole } from "./types";
export type { Role } from "./types";
export { checkInviteEligibility, normalizeEmail } from "./api/invite-check";
export type { InviteCheckDeps, InviteEligibility } from "./api/invite-check";
export { createLogEmailSender, maskEmail } from "./api/email-sender";
export type { EmailMessage, EmailSender } from "./api/email-sender";
export { createAuth, createInvitedUser, setUserDisabled } from "./api/auth";
export type { Auth, CreateAuthOptions, InvitedUserInput } from "./api/auth";
export { authRoute, getAuth } from "./api/instance";
