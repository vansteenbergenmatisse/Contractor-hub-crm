import { EmbedBridge } from "@/features/embed";

export const metadata = { title: "Contractor Hub", referrer: "no-referrer" };

// The page HighLevel opens as a custom page. All the work is in the browser bridge.
export default function Page() {
  return <EmbedBridge />;
}
