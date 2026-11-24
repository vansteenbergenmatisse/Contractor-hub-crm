// Types shared inside the admin feature.
export type TenantStatusValue = "connected" | "needs_reconnect" | "uninstalled";
export type LoginState = "on" | "off" | "no users";
// One row of Prisma's _prisma_migrations table (only the columns the check page reads).
export type MigrationRow = { name: string; finishedAt: Date | null; rolledBackAt: Date | null };
// /admin/migrations. `historyMissing`: no _prisma_migrations table, so everything is pending.
// `notInCode`: applied here but not in this code's manifest (the database is ahead of this deploy).
// `readError`: the database could not be read; nothing is known.
export type MigrationsView = {
  environment: string;
  ref: string | null;
  expected: number;
  applied: string[];
  pending: string[];
  problems: { name: string; state: "failed" | "rolled_back" }[];
  notInCode: string[];
  historyMissing: boolean;
  readError?: true;
};
export type ClientRow ={ tenantId: string; name: string; status: string; login: LoginState; users: number; signInPath?: string | null };
