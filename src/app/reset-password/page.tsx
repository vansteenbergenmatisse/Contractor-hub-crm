import { ResetPasswordForm } from "@/features/auth";
import { loadSignInBrand } from "@/features/brand";

export const metadata = { title: "Choose a new password", referrer: "no-referrer" };
export const dynamic = "force-dynamic";

// Better Auth redirects here with ?token=... after the email link is opened.
export default async function Page({ searchParams }: { searchParams: Promise<{ token?: string | string[]; client?: string | string[] }> }) {
  const { token, client } = await searchParams;
  return <ResetPasswordForm token={typeof token === "string" && token.length > 0 ? token : null} brand={await loadSignInBrand(client)} />;
}
