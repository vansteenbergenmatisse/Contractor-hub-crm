import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { AppShell, type SearchRow } from "@/features/app-shell";
import { INBOX_WAITING_COUNT, searchRows as inboxRows } from "@/features/inbox";
import { searchRows as invoiceRows } from "@/features/invoices";
import { searchRows as leadRows } from "@/features/leads";
import { searchRows as paymentRows } from "@/features/payments";
import { searchRows as pipelineRows } from "@/features/pipeline";
import { searchRows as quoteRows } from "@/features/quotes";
import { loadBusiness } from "@/features/brand";
import { loadMailboxPrompt, MailboxPromptCard } from "@/features/mailbox-prompt";
import { scheduleVisitSync } from "@/features/onboarding";
import { frameKey } from "@/shared/lib/frame-key";
import { getRequestUser } from "../session";

export const dynamic = "force-dynamic";

// Rows the search can find: the pages' sample rows (Phase 2, mock data; Phase 3 asks the backend).
// A page that has been opened hands in its current rows instead (`useSearchRows`), so moves, added
// leads and new prices show in search; these are the rows for pages not opened yet.
// The Today page's own list repeats the same people, so it is left out to avoid double results.
const SEARCH_ROWS: readonly SearchRow[] = [...leadRows, ...pipelineRows, ...quoteRows, ...invoiceRows, ...paymentRows, ...inboxRows];

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
    <AppShell key={frameKey(user.id, user.tenantId)} business={business} searchRows={SEARCH_ROWS} initialInboxCount={INBOX_WAITING_COUNT}>
      {mailboxPrompt.show ? <MailboxPromptCard token={mailboxPrompt.token} /> : null}
      {children}
    </AppShell>
  );
}
