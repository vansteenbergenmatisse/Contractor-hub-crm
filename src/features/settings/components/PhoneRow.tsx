import { usePhoneNumbers } from "../hooks/use-phone-numbers";
import type { PhoneNumbersSource, PhoneNumbersView } from "../types";

const MESSAGE: Record<Exclude<PhoneNumbersView["state"], "ok">, string> = {
  "no-access": "We do not have access to your phone numbers yet. Ask Forge Forward to reconnect your account.",
  "not-connected": "No phone system is connected yet.",
  inactive: "Your phone account is not active. Ask Forge Forward to check it.",
  unavailable: "Your phone numbers could not be loaded. Reload this page to try again.",
};

// The business phone row: only numbers the account really lists. No API gives an A2P status.
export function PhoneRow({ phone: source }: { phone?: PhoneNumbersSource }) {
  const shown = usePhoneNumbers(source);
  const phone = shown.loading ? undefined : shown.phone;
  return (
    <li className="sv-cr">
      <span className="sv-crt">
        <span className="sv-crn">Business phone</span>
        {shown.loading ? <span className="sv-crs" role="status">Checking your phone numbers…</span> : !phone ? <span className="sv-crs">Not available yet</span> : phone.state !== "ok" ? (
          <span className="sv-crs">{MESSAGE[phone.state]}</span>
        ) : phone.numbers.length === 0 ? (
          <span className="sv-crs">No number that can text was found.</span>
        ) : (
          phone.numbers.map((row) => <span className="sv-crs" key={row.number}>{row.number}{row.name ? `, ${row.name}` : ""}</span>)
        )}
        {phone?.state === "ok" && !phone.complete ? <span className="sv-crs">You may have more numbers than shown here.</span> : null}
        <span className="sv-crs">A2P status: Not available yet</span>
      </span>
    </li>
  );
}
