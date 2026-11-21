// Creates the first Forge Forward admin (no tenant). Run once per environment:
//   pnpm admin:create            (reads .env.local, the develop database)
// The password is read from a hidden prompt and never stored in the repo, a file or shell history.
// The email comes from ADMIN_EMAIL or a prompt. It writes to the database in .env.local, which is
// Neon `develop` (see CLAUDE.md). For staging or production, load that env on purpose and say so.
import { config } from "dotenv";
import { createInterface } from "node:readline";
import { Writable } from "node:stream";

// A DATABASE_URL already exported by the shell wins over .env.local (dotenv does not override). That
// is how staging or production could be hit by accident, so it needs CONFIRM_HOST=<host> to match.
const presetDatabase = process.env.DATABASE_URL !== undefined || process.env.DATABASE_URL_UNPOOLED !== undefined;
config({ path: ".env.local", quiet: true });

function ask(question: string, hidden: boolean): Promise<string> {
  return new Promise((resolve) => {
    let muted = false;
    const output = new Writable({
      write(chunk, _encoding, done) {
        if (!muted) process.stdout.write(chunk);
        done();
      },
    });
    const rl = createInterface({ input: process.stdin, output, terminal: true });
    rl.question(question, (answer) => {
      rl.close();
      if (hidden) process.stdout.write("\n");
      resolve(answer);
    });
    muted = hidden;
  });
}

async function main() {
  const { createAuth, createInvitedUser, createLogEmailSender } = await import("../src/features/auth");
  const { prismaAuthDatabase } = await import("../src/features/auth/db/auth-database");
  const { parseEnv } = await import("../src/shared/config");

  const env = parseEnv("auth");
  const host = new URL(process.env.DATABASE_URL as string).host; // never the full URL
  console.info(`Target database host: ${host}${presetDatabase ? " (from your shell, not .env.local)" : " (.env.local)"}`);
  if (presetDatabase && process.env.CONFIRM_HOST !== host) {
    throw new Error("The database comes from your shell. Re-run with CONFIRM_HOST set to the host shown above.");
  }
  const { getPrisma } = await import("../src/shared/lib/prisma");
  if ((await getPrisma().user.count({ where: { role: "admin" } })) > 0 && process.env.ALLOW_SECOND_ADMIN !== "1") {
    throw new Error("An admin already exists here. Set ALLOW_SECOND_ADMIN=1 to add another on purpose.");
  }
  const email = process.env.ADMIN_EMAIL?.trim() || (await ask("Admin email: ", false)).trim();
  const name = (await ask("Admin name: ", false)).trim() || "Admin";
  const password = await ask("Password (min 10 characters, hidden): ", true);
  const again = await ask("Password again: ", true);
  if (password !== again) throw new Error("The two passwords are not the same.");

  const auth = createAuth({
    database: prismaAuthDatabase(),
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    emailSender: createLogEmailSender(),
  });
  const { userId } = await createInvitedUser(auth, { email, name, password, role: "admin", tenantId: null });
  console.info(JSON.stringify({ audit: "admin_created", userId, host }));
  console.info("Admin created.");
}

main().then(
  () => process.exit(0),
  (error: unknown) => {
    console.error("Failed:", error instanceof Error ? error.message : "unknown error");
    process.exit(1);
  },
);
