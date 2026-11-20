import { defineConfig } from "prisma/config";

// Prisma CLI does not read .env.local. Neon writes the URLs there, so load it here.
try {
  process.loadEnvFile(".env.local");
} catch {
  // No .env.local (CI/production): rely on real environment variables.
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    // Migrations need the direct (unpooled) connection; the app uses the pooled DATABASE_URL.
    url: process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL ?? "",
  },
});
