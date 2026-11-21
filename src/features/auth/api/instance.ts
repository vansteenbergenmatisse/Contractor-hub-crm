import { parseEnv } from "@/shared/config";
import { createAuth, type Auth } from "./auth";
import { createLogEmailSender } from "./email-sender";
import { prismaAuthDatabase } from "../db/auth-database";

// Built on first use, never at import: `next build` needs no env and no database.
let instance: Auth | undefined;

// Throws when the auth env is incomplete; the message names variables, never values.
export function getAuth(): Auth {
  if (!instance) {
    const env = parseEnv("auth");
    instance = createAuth({
      database: prismaAuthDatabase(),
      secret: env.BETTER_AUTH_SECRET,
      baseURL: env.BETTER_AUTH_URL,
      emailSender: createLogEmailSender(),
    });
  }
  return instance;
}

// The route handler behind /api/auth/*. A missing env answers 500 with no detail.
export async function authRoute(request: Request): Promise<Response> {
  let auth: Auth;
  try {
    auth = getAuth();
  } catch (error) {
    console.error("Auth route:", error instanceof Error ? error.message : "invalid env");
    return new Response("Server is not configured.", { status: 500, headers: { "cache-control": "no-store" } });
  }
  return auth.handler(request);
}
