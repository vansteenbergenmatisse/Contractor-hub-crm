import { prismaAdapter } from "better-auth/adapters/prisma";
import { getPrisma } from "@/shared/lib/prisma";

// The only place the auth feature touches Prisma. Better Auth reads and writes its own tables
// (User, Session, Account, Verification, RateLimit) through this adapter.
export function prismaAuthDatabase() {
  return prismaAdapter(getPrisma(), { provider: "postgresql" });
}
