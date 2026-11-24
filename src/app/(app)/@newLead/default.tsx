import { NewLeadDialog } from "@/features/leads";

// The New lead form, on every signed-in page, through a layout slot: the shell stays free of a leads
// import.
export default function NewLeadSlot() {
  return <NewLeadDialog />;
}
