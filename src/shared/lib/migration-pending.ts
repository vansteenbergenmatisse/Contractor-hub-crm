// A table the code needs is not in this database yet: its migration has not been applied here.
// Prisma reports that as P2021 ("table does not exist"). A db/ file turns it into this error so the
// caller can answer "update pending" instead of "try again" (trying again cannot help).
export class MigrationPendingError extends Error {
  readonly migration: string;

  constructor(migration: string) {
    super(`Migration ${migration} is not applied on this database.`);
    this.name = "MigrationPendingError";
    this.migration = migration;
  }
}

export function isMigrationPendingError(error: unknown): error is MigrationPendingError {
  return error instanceof MigrationPendingError;
}

// Prisma's "table does not exist" (P2021). Checked by code, so no Prisma runtime import is needed.
export function isMissingTableError(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: unknown }).code === "P2021";
}

// Runs a query; a missing table becomes MigrationPendingError, every other error is rethrown unchanged.
export async function orMigrationPending<T>(migration: string, query: () => Promise<T>): Promise<T> {
  try {
    return await query();
  } catch (error) {
    if (isMissingTableError(error)) throw new MigrationPendingError(migration);
    throw error;
  }
}
