import { leadFormAccess, NewLeadDialog } from "@/features/leads";
import { getRequestUser } from "../../session";

// The New lead form, on every signed-in page, through a layout slot: the shell stays free of a leads
// import. The session decides whether this person's form can save.
export default async function NewLeadSlot() {
  return <NewLeadDialog access={leadFormAccess(await getRequestUser())} />;
}
