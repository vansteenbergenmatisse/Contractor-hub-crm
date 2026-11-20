import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts", ".claude/**", "src/generated/**"]),
  {
    // Feature boundaries (see CLAUDE.md): other code imports a feature only through its index.ts.
    files: ["src/**/*.{ts,tsx}", "tests/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/features/*/*"],
              message: "Import a feature only through its public API: @/features/<name>.",
            },
            {
              group: ["@/app/*", "@/app"],
              message: "Never import from src/app. Pages compose features, not the other way round.",
            },
          ],
        },
      ],
    },
  },
]);
