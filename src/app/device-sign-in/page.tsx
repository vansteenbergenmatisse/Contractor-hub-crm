import { redirect } from "next/navigation";
import { DeviceSignIn } from "@/features/auth";
import { getRequestUser } from "../session";

export const metadata = { title: "Open your CRM", referrer: "no-referrer" };
export const dynamic = "force-dynamic";

// Where a handoff (from HighLevel's frame) or a pairing link (QR code) lands. Someone already signed in
// on this device goes straight to the app: nothing is redeemed and nothing loops.
export default async function Page() {
  if (await getRequestUser()) redirect("/");
  return <DeviceSignIn />;
}
