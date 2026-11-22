import { ForgotPasswordForm } from "@/features/auth";
import { loadSignInBrand } from "@/features/brand";

export const metadata = { title: "Reset your password" };
// The answer depends on ?client=, so it is rendered per request and never shared between clients.
export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: Promise<{ client?: string | string[] }> }) {
  const { client } = await searchParams;
  return <ForgotPasswordForm brand={await loadSignInBrand(client)} />;
}
