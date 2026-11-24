import { notFound } from "next/navigation";
import { ClientsTable, ClientViewBanner, listClients } from "@/features/admin";
import { scheduleTokenRenewal } from "@/features/onboarding";
import { loadTemplateCopyView } from "@/features/template-copy";
import { getRequestUser } from "../../session";

export const metadata = { title: "Clients" };
export const dynamic = "force-dynamic";
// The background renewal runs inside this function's lifetime.
export const maxDuration = 60;

// Admin only. Anyone else (signed out, owner, office) gets a 404, so the page does not advertise itself.
export default async function Page() {
  const user = await getRequestUser();
  if (user?.role !== "admin") notFound();
  // A read-only client view must never change a client's connection.
  if (!user.viewing) scheduleTokenRenewal();
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
  // Copy from template and its "still template values" warning: off unless TEMPLATE_COPY_ENABLED,
  // never during a view, and bounded in time (an unknown client shows no warning).
  const templateCopy = await loadTemplateCopyView(clients.map((client) => client.tenantId));
  return <ClientsTable clients={clients} templateCopy={templateCopy} />;
}
