import { isValidEncryptionKey } from "@/shared/lib/encryption";

// Env names per group. A group is parsed only when something needs it, so `next build`
// works with no env set. Names come from docs/greenlane/build-prompt.md section 15.
const GROUPS = {
  database: ["DATABASE_URL"],
  highlevel: [
    "GHL_APP_ID",
    "GHL_CLIENT_ID",
    "GHL_CLIENT_SECRET",
    "GHL_APP_SHARED_SECRET",
    "GHL_REDIRECT_URI",
    "GHL_API_BASE_URL",
    "GHL_INSTALL_BASE_URL",
    "TOKEN_ENCRYPTION_KEY",
  ],
  auth: ["APP_URL", "BETTER_AUTH_URL", "BETTER_AUTH_SECRET"],
} as const;

// Names that must never carry the NEXT_PUBLIC_ prefix (it would ship the value to the browser).
const SECRET_NAMES = [
  "DATABASE_URL",
  "DATABASE_URL_UNPOOLED",
  "GHL_CLIENT_SECRET",
  "GHL_APP_SHARED_SECRET",
  "TOKEN_ENCRYPTION_KEY",
  "BETTER_AUTH_SECRET",
] as const;

// HighLevel endpoints must be https: tokens and the client secret travel to them.
const HTTPS_URL_NAMES = ["GHL_API_BASE_URL", "GHL_INSTALL_BASE_URL", "GHL_REDIRECT_URI"] as const;

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

export type EnvGroup = keyof typeof GROUPS;
export type EnvValues<G extends EnvGroup> = Record<(typeof GROUPS)[G][number], string>;
export type EnvSource = Record<string, string | undefined>;

export function parseEnv<G extends EnvGroup>(
  group: G,
  source: EnvSource = process.env,
): EnvValues<G> {
  const exposed = SECRET_NAMES.map((name) => `NEXT_PUBLIC_${name}`).filter(
    (name) => source[name] !== undefined,
  );
  if (exposed.length > 0) {
    throw new Error(`Secrets must not use the NEXT_PUBLIC_ prefix: ${exposed.join(", ")}`);
  }
  const names: readonly string[] = GROUPS[group];
  const missing = names.filter((name) => !source[name]?.trim());
  if (missing.length > 0) {
    throw new Error(`Missing environment variables for "${group}": ${missing.join(", ")}`);
  }
  if (group === "highlevel" && !isValidEncryptionKey((source.TOKEN_ENCRYPTION_KEY as string).trim())) {
    throw new Error("Invalid environment variable: TOKEN_ENCRYPTION_KEY must be 32 bytes, standard base64.");
  }
  if (group === "highlevel") {
    for (const name of HTTPS_URL_NAMES) {
      if (!isHttpsUrl((source[name] as string).trim())) {
        throw new Error(`Invalid environment variable: ${name} must be an https URL.`);
      }
    }
  }
  return Object.fromEntries(names.map((name) => [name, (source[name] as string).trim()])) as EnvValues<G>;
}
