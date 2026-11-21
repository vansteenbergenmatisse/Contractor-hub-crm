// Public API of the admin feature. Other code imports from "@/features/admin" only.
export { loginState, statusLabel, toClientRow } from "./api/clients";
export { listClients } from "./db/clients";
export { ClientsTable } from "./components/ClientsTable";
export type { ClientRow, LoginState } from "./types";
