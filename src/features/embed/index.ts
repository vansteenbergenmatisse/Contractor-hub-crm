// Public API of the embed feature. Other code imports from "@/features/embed" only.
export { decryptUserContext, EmbedError } from "./api/decrypt";
export { resolveEmbedAccess, resolveEmbedUser } from "./api/resolve";
export { startHandshake } from "./api/handshake";
export { claimAutoJump, FULL_SCREEN_PATH, fullScreenUrl, tryTopNavigation } from "./api/full-screen";
export { findEmbedCandidate, findEmbedTenant } from "./db/candidate";
export { EmbedBridge } from "./components/EmbedBridge";
export { FramedSignedOut } from "./components/FramedSignedOut";
export { isFramedRequest } from "./api/framed";
export { EMBED_DENIAL_CODES, EMBED_DENIAL_HEADER, EMBED_DENIAL_MESSAGES, isEmbedDenialCode } from "./api/denial";
export type { EmbedDenialCode } from "./api/denial";
export type { HandshakeDeps, HandshakeResult } from "./api/handshake";
export type { EmbedAccess, EmbedCandidate, EmbedErrorCode, EmbedTenant, EmbedTenantStatus, UserContext } from "./types";
