import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { AppShell, type SearchRow } from "@/features/app-shell";
import { loadBusiness } from "@/features/brand";
import { loadMailboxPrompt, MailboxPromptCard } from "@/features/mailbox-prompt";
import { scheduleVisitSync } from "@/features/onboarding";
import { frameKey } from "@/shared/lib/frame-key";
import { getRequestUser } from "../session";

export const dynamic = "force-dynamic";

// Search starts empty. A wired page that has been opened hands in its real rows (`useSearchRows`).
const SEARCH_ROWS: readonly SearchRow[] = [];

// Every signed-in tenant page. Signed out goes to /sign-in; an admin has no tenant data and goes to
// the admin page. The tenant comes from the session only.
export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await getRequestUser();
  if (!user) redirect("/sign-in");
  if (user.role === "admin" || !user.tenantId) redirect("/admin/clients");
  // Runs after the response; the page never waits for it and a failure never reaches it.
  scheduleVisitSync(user.tenantId);
  // The reminder never throws and has a short read limit, so it cannot break or hold up the page.
  const [business, mailboxPrompt] = await Promise.all([loadBusiness(user.tenantId, user.name), loadMailboxPrompt(user)]);
  // Keyed by user and tenant (hashed, keys reach the browser): another signed-in user gets a new frame.
  return (
    <AppShell key={frameKey(user.id, user.tenantId)} business={business} searchRows={SEARCH_ROWS}>
      {mailboxPrompt.show ? <MailboxPromptCard token={mailboxPrompt.token} /> : null}
      {children}
    </AppShell>
  );
}
