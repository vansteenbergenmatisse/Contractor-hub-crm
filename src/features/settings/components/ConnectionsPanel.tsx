import type { PhoneNumbersSource } from "../types";
import { HandoffRow } from "./HandoffRow";
import { PhoneRow } from "./PhoneRow";

const HANDOFFS = [
  { name: "Calendar", sub: "Keep your own calendar and this one the same.", steps: ["Open your HighLevel account.", "Go to Settings, then Integrations.", "Connect your calendar and allow access."] },
  { name: "Gmail", sub: "Send and receive email from your own address.", steps: ["Open your HighLevel account.", "Go to Settings, then Integrations.", "Connect Google and allow Gmail."] },
];
const NOT_CONNECTED = [
  { name: "Facebook page", sub: "Messages to your page." },
  { name: "Instagram", sub: "Messages to your Instagram account." },
  { name: "Google My Business", sub: "Your Google reviews and leads." },
];

// Each row states only what has a real source. Nothing here ever says Connected.
export function ConnectionsPanel({ phone, hidden }: { phone?: PhoneNumbersSource; hidden: boolean }) {
  return (
    <section className="sv-card ga-xsec" aria-labelledby="s-t-conn" hidden={hidden}>
      <h2 className="ga-xt" id="s-t-conn">Connections</h2>
      <p className="ga-xl">What links to your dashboard.</p>
      <ul className="sv-crl">
        <PhoneRow phone={phone} />
        {HANDOFFS.map((row) => <HandoffRow key={row.name} {...row} />)}
        {NOT_CONNECTED.map((row) => (
          <li className="sv-cr" key={row.name}>
            <span className="sv-crt"><span className="sv-crn">{row.name}</span><span className="sv-crs">{row.sub}</span></span>
            <span className="sv-chip">Not connected yet</span>
          </li>
        ))}
        <li className="sv-cr">
          <span className="sv-crt"><span className="sv-crn">Online payments</span><span className="sv-crs">Customers pay invoices online.</span></span>
          <span className="sv-chip">Not available yet</span>
        </li>
      </ul>
    </section>
  );
}
