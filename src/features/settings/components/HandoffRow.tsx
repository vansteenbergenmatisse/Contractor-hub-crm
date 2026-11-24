type Props = { name: string; sub: string; steps: readonly string[] };

// A connection the owner makes in HighLevel. This app cannot read its status, so it shows none.
export function HandoffRow({ name, sub, steps }: Props) {
  return (
    <li className="sv-cr">
      <span className="sv-crt">
        <span className="sv-crn">{name}</span>
        <span className="sv-crs">{sub}</span>
        <details className="ga-handoff">
          <summary>Connect in HighLevel</summary>
          <ol>{steps.map((step) => <li key={step}>{step}</li>)}</ol>
        </details>
      </span>
    </li>
  );
}
