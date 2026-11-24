// Public API of the admin-values feature. Other code imports from "@/features/admin-values" only.
// Admin "Edit values": every custom value of one client (secret-looking ones included, admin only),
// edited through the Settings write-back path, and per-key locks the owner cannot change.
export { AdminValuesPage } from "./components/AdminValuesPage";
export { adminValuesRoute, loadAdminValues } from "./api/instance";
export { adminValuesFailure, handleAdminValues } from "./api/route";
export type { AdminValuesRouteDeps } from "./api/route";
export { buildAdminValuesView } from "./api/view";
export type { AdminValueFolder, AdminValueGroup, AdminValueRow, AdminValuesView } from "./types";
