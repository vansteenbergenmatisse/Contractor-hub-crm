import { SOON_ITEMS, SWITCHES } from "../api/fields";

// No choice has a backend yet, so none gets a working switch.
export function ChoicesPanel({ hidden }: { hidden: boolean }) {
  return (
    <section className="sv-card ga-xsec" aria-labelledby="s-t-choice" hidden={hidden}>
      <h2 className="ga-xt" id="s-t-choice">Your choices</h2>
      <p className="ga-xl">These choices are coming later.</p>
      <ul className="sv-crl">
        {[...SWITCHES, ...SOON_ITEMS].map((label) => (
          <li className="sv-cr" key={label}>
            <span className="sv-crt"><span className="sv-crn">{label}</span></span>
            <span className="sv-chip">Not available yet</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
