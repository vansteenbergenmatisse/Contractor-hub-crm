import { ResetPasswordForm } from "@/features/auth";

export const metadata = { title: "Choose a new password", referrer: "no-referrer" };
export const dynamic = "force-dynamic";

// Better Auth redirects here with ?token=... after the email link is opened.
export default async function Page({ searchParams }: { searchParams: Promise<{ token?: string | string[] }> }) {
  const { token } = await searchParams;
  return <ResetPasswordForm token={typeof token === "string" && token.length > 0 ? token : null} />;
}
