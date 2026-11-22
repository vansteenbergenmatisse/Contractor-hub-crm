// Public API of the embed feature. Other code imports from "@/features/embed" only.
export { decryptUserContext, EmbedError } from "./api/decrypt";
export { resolveEmbedUser } from "./api/resolve";
export { startHandshake } from "./api/handshake";
export { findEmbedCandidate } from "./db/candidate";
export { EmbedBridge } from "./components/EmbedBridge";
export type { HandshakeDeps, HandshakeResult } from "./api/handshake";
export type { EmbedCandidate, EmbedErrorCode, EmbedTenantStatus, UserContext } from "./types";
