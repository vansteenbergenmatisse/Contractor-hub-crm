import { notFound } from "next/navigation";
import { MigrationsPanel, loadMigrationsView } from "@/features/admin";
import { getRequestUser } from "../../session";

export const metadata = { title: "Database migrations" };
export const dynamic = "force-dynamic";

// Admin only, never during View as client. Anyone else gets a 404, so the page does not advertise itself.
export default async function Page() {
  const user = await getRequestUser();
  if (user?.role !== "admin" || user.viewing) notFound();
  return <MigrationsPanel view={await loadMigrationsView()} />;
}
