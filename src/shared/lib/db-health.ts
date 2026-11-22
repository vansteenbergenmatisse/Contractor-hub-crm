import { getPrisma } from "./prisma";

export type DatabaseHealth = { ok: true; database: string } | { ok: false; error: "database_unavailable" };

// Round-trips to Postgres so we know the connection, driver and credentials work. The endpoint is
// public, so a failure answers a fixed code; the driver's message (hosts, ports, names) goes to the
// server log only.
export async function checkDatabase(): Promise<DatabaseHealth> {
  try {
    const rows = await getPrisma().$queryRaw<{ database: string }[]>`SELECT current_database()::text AS database`;
    return { ok: true, database: rows[0]?.database ?? "unknown" };
  } catch (error) {
    console.error("database health check failed:", error instanceof Error ? error.message : error);
    return { ok: false, error: "database_unavailable" };
  }
}
