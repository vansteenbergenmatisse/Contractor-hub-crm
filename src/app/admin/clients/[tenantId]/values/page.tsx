import { notFound } from "next/navigation";
import { AdminValuesPage, loadAdminValues } from "@/features/admin-values";
import { getRequestUser } from "../../../../session";

export const metadata = { title: "Client values" };
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ tenantId: string }> };

// Admin only, never during View as client, and only for a connected tenant. Anyone else gets a 404.
export default async function Page({ params }: Props) {
  const user = await getRequestUser();
  if (user?.role !== "admin" || user.viewing) notFound();
  const { tenantId } = await params;
  const view = await loadAdminValues(tenantId);
  if (!view) notFound();
  return <AdminValuesPage view={view} />;
}
