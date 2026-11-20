import { prisma } from "./prisma";

export type DatabaseHealth = { ok: true; database: string } | { ok: false; error: string };

// Round-trips to Postgres so we know the connection, driver and credentials work.
export async function checkDatabase(): Promise<DatabaseHealth> {
  try {
    const rows = await prisma.$queryRaw<{ database: string }[]>`SELECT current_database() AS database`;
    return { ok: true, database: rows[0]?.database ?? "unknown" };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "unknown error" };
  }
}
