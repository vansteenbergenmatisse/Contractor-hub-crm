import { config } from "dotenv";
import { defineConfig } from "prisma/config";

// Neon writes .env.local; .env is the fallback. Real environment variables (CI) always win.
config({ path: [".env.local", ".env"], quiet: true });

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    // Prisma CLI only (migrate, db push, studio): the direct, unpooled connection.
    // Not env(): that throws when unset, which would break `prisma generate` (postinstall, CI)
    // where no database is needed. Migrate commands fail on the empty URL.
    url: process.env.DATABASE_URL_UNPOOLED ?? "",
  },
});
