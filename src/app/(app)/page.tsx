import { businessValues } from "@/features/app-shell";
import { loadBusiness } from "@/features/brand";
import { TodayPage } from "@/features/today";
import { getRequestUser } from "../session";

export const dynamic = "force-dynamic";

// The layout has already sent signed-out users away; the greeting uses the owner's first name from
// the sub-account's custom values. The user and business lookups are shared with the layout.
export default async function Page() {
  const user = await getRequestUser();
  // The owner's first name, or nothing: a missing name gives a plain "Morning." greeting.
  const owner = user?.tenantId ? businessValues(await loadBusiness(user.tenantId, user.name)).business_owner_name : "";
  const first = owner.split(/\s+/)[0] || undefined;
  return <TodayPage ownerFirst={first} />;
}
