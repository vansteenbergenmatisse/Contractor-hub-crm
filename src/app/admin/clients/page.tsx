import { notFound } from "next/navigation";
import { ClientsTable, ClientViewBanner, listClients } from "@/features/admin";
import { getRequestUser } from "../../session";

export const metadata = { title: "Clients" };
export const dynamic = "force-dynamic";

// Admin only. Anyone else (signed out, owner, office) gets a 404, so the page does not advertise itself.
export default async function Page() {
  const user = await getRequestUser();
  if (user?.role !== "admin") notFound();
  const clients = await listClients();
  // The client's brand is still applied during a view, so this page says so and offers the exit.
  if (user.viewing) {
    return (
      <>
        <ClientViewBanner name={clients.find((client) => client.tenantId === user.tenantId)?.name ?? ""} />
        <ClientsTable clients={clients} />
      </>
    );
  }
  return <ClientsTable clients={clients} />;
}
