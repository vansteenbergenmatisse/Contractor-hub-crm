import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "@/generated/prisma/client";

// Pool settings (proposal, tune with real load). Free-plan computes sleep after 5 minutes idle,
// so the first connection afterwards is slow: allow a generous connect timeout.
const POOL_MAX = 10;
const CONNECT_TIMEOUT_MS = 10_000;

// One client per process. Cached on globalThis in development to survive Next.js hot reloads.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createClient(): PrismaClient {
  // Pooled URL (host contains -pooler). App runtime only.
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set. See .env.example.");
  }
  const adapter = new PrismaNeon({
    connectionString,
    max: POOL_MAX,
    connectionTimeoutMillis: CONNECT_TIMEOUT_MS,
  });
  return new PrismaClient({ adapter });
}

// Lazy: nothing connects (or reads env) at import time, so `next build` works without a database.
let client: PrismaClient | undefined = globalForPrisma.prisma;

export function getPrisma(): PrismaClient {
  client ??= createClient();
  if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = client;
  return client;
}
