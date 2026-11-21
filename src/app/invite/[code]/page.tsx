import { headers } from "next/headers";
import { clientKeyFromHeaders, getInviteLimiter, getInviteService, InviteAcceptForm } from "@/features/auth";

export const metadata = { title: "Accept your invite", referrer: "no-referrer" };
export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  let email: string | null = null;
  try {
    const key = `invite-preview:${clientKeyFromHeaders(await headers())}`;
    if (await getInviteLimiter()(key)) {
      const preview = await getInviteService().previewInvite(code);
      email = preview.valid ? preview.email : null;
    }
  } catch {
    email = null; // not configured, database down or limited: show the same "does not work" screen
  }
  return <InviteAcceptForm code={code} email={email} />;
}
