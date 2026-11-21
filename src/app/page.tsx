import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { currentUserFromHeaders } from "@/features/auth";

export const dynamic = "force-dynamic";

// Signed out goes to the sign-in page; the Today page replaces this placeholder (Phase 2).
export default async function Page() {
  const user = await currentUserFromHeaders(await headers());
  if (!user) redirect("/sign-in");
  return <main>Contractor Hub CRM</main>;
}
