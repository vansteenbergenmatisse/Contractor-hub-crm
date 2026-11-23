import { cache } from "react";
import { businessValues } from "@/features/app-shell";
import { hitRateLimit } from "@/features/auth";
import { loadBusiness } from "@/features/brand";
import { createTenantContactsReader } from "@/features/highlevel";
import { loadLeads } from "@/features/leads";
import { LeadsTile, TodayLeadsCard, TodayPage } from "@/features/today";
import { getRequestUser } from "../session";

export const dynamic = "force-dynamic";

// One read per request for both lead sections. The tenant comes from the session only.
const loadTenantLeads = cache(async () => {
  const user = await getRequestUser();
  const reader = user?.viewing ? createTenantContactsReader(hitRateLimit, { viewerId: user.id }) : createTenantContactsReader(hitRateLimit);
  return loadLeads(user?.tenantId, reader);
});

async function LeadsTileData() {
  return <LeadsTile result={await loadTenantLeads()} />;
}

async function LeadsCardData() {
  return <TodayLeadsCard result={await loadTenantLeads()} />;
}

// The layout has already sent signed-out users away; the greeting uses the owner's first name from
// the sub-account's custom values. The user and business lookups are shared with the layout.
// The lead sections load inside TodayPage's Suspense boundaries, so the page does not wait for them.
export default async function Page() {
  const user = await getRequestUser();
  // The owner's first name, or nothing: a missing name gives a plain "Morning." greeting.
  const business = user?.tenantId
    ? await (user.viewing ? loadBusiness(user.tenantId, "", true) : loadBusiness(user.tenantId, user.name))
    : null;
  const owner = business ? businessValues(business).business_owner_name : "";
  const first = owner.split(/\s+/)[0] || undefined;
  return <TodayPage ownerFirst={first} leadsTile={<LeadsTileData />} leadsCard={<LeadsCardData />} />;
}
