import { joinParts } from "@/shared/lib/join-parts";
import type { Lead, LeadContact, LeadContactsReader, LeadsResult } from "../types";
import { extraOrigin } from "./lead-sources";
import { sourceKey } from "./leads-logic";

function toLead(contact: LeadContact): Lead {
  const place = joinParts([contact.city, joinParts([contact.state, contact.postalCode], " ")], ", ");
  const origin = extraOrigin(contact.source);
  return {
    ...(origin ? { origin } : {}),
    id: contact.id,
    name: contact.name ?? "Unnamed lead",
    source: sourceKey(contact.source),
    need: "",
    minutesWaiting: 0,
    receivedAt: contact.dateAdded,
    address: joinParts([contact.address, place], ", "),
    status: "new",
  };
}

// The leads of one tenant, read by `read` (the server page passes its reader). The tenant comes from
// the server session. Never sample data: a failure is a state the page shows. Setting the server
// flag LEADS_READ_DISABLED=true turns the read off and shows the unavailable state.
export async function loadLeads(
  tenantId: string | null | undefined,
  read: LeadContactsReader,
  now: () => Date = () => new Date(),
): Promise<LeadsResult> {
  if (!tenantId || process.env.LEADS_READ_DISABLED?.trim() === "true") return { state: "unavailable" };
  let answer;
  try {
    answer = await read(tenantId);
  } catch {
    return { state: "unavailable" };
  }
  if (!answer.ok) return { state: answer.reason };
  if (answer.dropped > 0) console.warn(`Leads: left out ${answer.dropped} malformed contact rows.`);
  // No row on a page that was cut off: real leads may lie beyond it, so it must not read as empty.
  if (answer.contacts.length === 0) return answer.dropped > 0 || !answer.complete ? { state: "unavailable" } : { state: "empty" };
  const leads = answer.contacts
    .map(toLead)
    .sort((a, b) => Date.parse(b.receivedAt ?? "") - Date.parse(a.receivedAt ?? ""));
  return { state: "ready", leads, loadedAt: now().toISOString(), complete: answer.complete, dropped: answer.dropped };
}
