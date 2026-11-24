import type { Auth } from "./auth";

// The admin-issued set-password links, stored through Better Auth's own adapter in its own format
// (`reset-password:<token>`, the user id as value), so its reset endpoint accepts them. Going through
// the adapter (not Prisma directly) keeps the format Better Auth's, and lets tests run the real code
// against the memory adapter.
const PREFIX = "reset-password:";

export function createResetTokenStore(auth: Pick<Auth, "$context">) {
  // Every set-password link of this person (admin-issued and Forgot password alike) stops working.
  async function deleteResetTokens(userId: string): Promise<void> {
    const context = await auth.$context;
    await context.adapter.deleteMany({
      model: "verification",
      where: [
        { field: "identifier", operator: "starts_with", value: PREFIX },
        { field: "value", value: userId },
      ],
    });
  }

  // A new link replaces the older ones: only the newest set-password link of this person works.
  async function replaceResetToken(userId: string, token: string, expiresAt: Date): Promise<void> {
    await deleteResetTokens(userId);
    const context = await auth.$context;
    await context.internalAdapter.createVerificationValue({ identifier: `${PREFIX}${token}`, value: userId, expiresAt });
  }

  return { replaceResetToken, deleteResetTokens };
}
