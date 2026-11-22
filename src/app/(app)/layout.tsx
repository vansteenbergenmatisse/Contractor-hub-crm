import type { ReactNode } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AppShell, buildBusiness, type SearchRow } from "@/features/app-shell";
import { currentUserFromHeaders } from "@/features/auth";
import { getBrandService } from "@/features/brand";

export const dynamic = "force-dynamic";

// Every signed-in tenant page. Signed out goes to /sign-in; an admin has no tenant data and goes to
// the admin page. The tenant comes from the session only. Business name and owner come from the
// sub-account's custom values; an empty value shows a plain fallback, never a made-up name.
async function loadBusiness(tenantId: string, fallbackOwner: string) {
  try {
    const brand = await getBrandService().getBrand(tenantId);
    return buildBusiness({ name: brand.businessName, owner: brand.ownerName ?? fallbackOwner });
  } catch {
    return buildBusiness({ owner: fallbackOwner });
  }
}

// Rows the search can find. Each page feature adds its own sample rows here (Phase 2, mock data).
const SEARCH_ROWS: readonly SearchRow[] = [];

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await currentUserFromHeaders(await headers());
  if (!user) redirect("/sign-in");
  if (user.role === "admin" || !user.tenantId) redirect("/admin/clients");
  const business = await loadBusiness(user.tenantId, user.name);
  return (
    <AppShell business={business} searchRows={SEARCH_ROWS}>
      {children}
    </AppShell>
  );
}
