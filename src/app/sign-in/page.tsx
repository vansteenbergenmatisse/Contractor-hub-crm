import { cookies } from "next/headers";
import { loadSignInPage, SIGN_IN_HINT_COOKIE, SignInForm } from "@/features/auth";
import { loadSignInBrand } from "@/features/brand";

export const metadata = { title: "Sign in" };
// The answer depends on ?client= and the sign-in hint cookie, so it is rendered per request and never
// shared between clients.
export const dynamic = "force-dynamic";

// The hint cookie's raw value; anything going wrong reads as no hint.
async function hintCookie(): Promise<string | undefined> {
  try {
    return (await cookies()).get(SIGN_IN_HINT_COOKIE)?.value;
  } catch {
    return undefined;
  }
}

export default async function Page({ searchParams }: { searchParams: Promise<{ client?: string | string[] }> }) {
  const { client } = await searchParams;
  const view = await loadSignInPage(client, await hintCookie());
  const brand = await loadSignInBrand(view.brandClient);
  return <SignInForm brand={brand} highLevel={view.highLevel} hint={view.hint} />;
}
