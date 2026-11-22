import { headers } from "next/headers";
import { currentUserFromHeaders } from "@/features/auth";
import { businessValues } from "@/features/app-shell";
import { TodayPage } from "@/features/today";
import { loadBusiness } from "./business";

export const dynamic = "force-dynamic";

// The layout has already sent signed-out users away; the greeting uses the owner's first name from
// the sub-account's custom values.
export default async function Page() {
  const user = await currentUserFromHeaders(await headers());
  // The owner's first name, or nothing: a missing name gives a plain "Morning." greeting.
  const owner = user?.tenantId ? businessValues(await loadBusiness(user.tenantId, user.name)).business_owner_name : "";
  const first = owner.split(/\s+/)[0] || undefined;
  return <TodayPage ownerFirst={first} />;
}
