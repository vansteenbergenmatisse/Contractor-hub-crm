// Public API of the embed feature. Other code imports from "@/features/embed" only.
export { decryptUserContext, EmbedError } from "./api/decrypt";
export { resolveEmbedAccess, resolveEmbedUser } from "./api/resolve";
export { startHandshake } from "./api/handshake";
export { FULL_SCREEN_PATH, fullScreenUrl, tryTopNavigation } from "./api/full-screen";
export { findEmbedCandidate, findEmbedTenant } from "./db/candidate";
export { EmbedBridge } from "./components/EmbedBridge";
export type { HandshakeDeps, HandshakeResult } from "./api/handshake";
export type { EmbedAccess, EmbedCandidate, EmbedErrorCode, EmbedTenant, EmbedTenantStatus, UserContext } from "./types";
