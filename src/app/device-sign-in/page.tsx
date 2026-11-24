import { DeviceSignIn } from "@/features/auth";
import { getRequestUser } from "../session";

export const metadata = { title: "Open your CRM", referrer: "no-referrer" };
export const dynamic = "force-dynamic";

// Where a handoff (from HighLevel's frame) or a pairing link (QR code) lands. No server redirect for a
// visitor who already has a session: the framed /embed sign-in leaves a one-day "do not remember"
// cookie that browsers allowing third-party cookies also send here, and a pairing link may be opened
// where someone else is signed in. The token sits in the fragment, which only the browser sees, so the
// page decides there: a token is redeemed on Continue (replacing the old session with a long first-party
// one); no token and a session goes to the app once. Nothing redirects back here, so nothing loops.
export default async function Page() {
  const signedIn = Boolean(await getRequestUser());
  return <DeviceSignIn signedIn={signedIn} />;
}
