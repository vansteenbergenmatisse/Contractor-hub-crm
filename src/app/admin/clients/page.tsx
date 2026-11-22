import { notFound } from "next/navigation";
import { ClientsTable, listClients } from "@/features/admin";
import { getRequestUser } from "../../session";

export const metadata = { title: "Clients" };
export const dynamic = "force-dynamic";

// Admin only. Anyone else (signed out, owner, office) gets a 404, so the page does not advertise itself.
export default async function Page() {
  const user = await getRequestUser();
  if (user?.role !== "admin") notFound();
  return <ClientsTable clients={await listClients()} />;
}
