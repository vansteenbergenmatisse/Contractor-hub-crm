import { SignInForm } from "@/features/auth";
import { loadSignInBrand } from "@/features/brand";

export const metadata = { title: "Sign in" };
// The answer depends on ?client=, so it is rendered per request and never shared between clients.
export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: Promise<{ client?: string | string[] }> }) {
  const { client } = await searchParams;
  return <SignInForm brand={await loadSignInBrand(client)} />;
}
