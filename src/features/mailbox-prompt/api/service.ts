import { randomUUID } from "node:crypto";
import type { DismissalStore, MailboxPromptView, PromptUser } from "../types";

// A slow database must not hold the page back for a reminder card.
const READ_TIMEOUT_MS = 1500;

export function canSeeMailboxPrompt(user: Pick<PromptUser, "role" | "tenantId">): boolean {
  return (user.role === "owner" || user.role === "office") && typeof user.tenantId === "string" && user.tenantId.length > 0;
}

// Fixed text only: a database error can carry personal data.
const logFailure = (step: string, error: unknown) =>
  console.error(`Mailbox prompt ${step} failed:`, error instanceof Error ? error.name : "unknown error");

async function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("timeout")), ms);
  });
  try {
    return await Promise.race([work, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

export function createMailboxPromptService(store: DismissalStore, options: { readTimeoutMs?: number } = {}) {
  const readTimeoutMs = options.readTimeoutMs ?? READ_TIMEOUT_MS;

  // Never throws. If the state cannot be read (for example the migration is not applied) the card
  // stays hidden and the page carries on.
  async function load(user: PromptUser): Promise<MailboxPromptView> {
    const token = randomUUID();
    if (!canSeeMailboxPrompt(user)) return { show: false, token };
    try {
      const dismissed = await withTimeout(store.isDismissed(user.id, user.tenantId as string), readTimeoutMs);
      return { show: !dismissed, token };
    } catch (error) {
      logFailure("read", error);
      return { show: false, token };
    }
  }

  async function dismiss(user: PromptUser): Promise<boolean> {
    if (!canSeeMailboxPrompt(user)) return false;
    try {
      await store.saveDismissal(user.id, user.tenantId as string);
      return true;
    } catch (error) {
      logFailure("save", error);
      return false;
    }
  }

  // Seam for Phase 3: call on the server when an email send fails, with the session's user, then
  // refresh the route (`router.refresh()`) so the layout shows the card again. Never throws, so it
  // cannot break the send's own error handling.
  async function reopen(user: PromptUser): Promise<boolean> {
    if (!canSeeMailboxPrompt(user)) return false;
    try {
      await store.clearDismissal(user.id, user.tenantId as string);
      return true;
    } catch (error) {
      logFailure("reopen", error);
      return false;
    }
  }

  return { load, dismiss, reopen };
}
