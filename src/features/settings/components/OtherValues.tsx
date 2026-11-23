type Props = { names: readonly string[]; searching: boolean };

// Keys the page has no field for, by name only: their values never reach the browser. Closed by
// default because an account can hold many; a search opens it to show the matches.
export function OtherValues({ names, searching }: Props) {
  if (names.length === 0) return null;
  return (
    <fieldset className="fd-cvset">
      <legend className="fd-cgh">Other values</legend>
      <p className="fd-hint fd-cvh">Edit this in HighLevel</p>
      <details className="fd-cvo" open={searching || undefined}>
        <summary>Show {names.length === 1 ? "1 name" : `${names.length} names`}</summary>
        <ul>{names.map((name) => <li className="fd-cvk" key={name}>{name}</li>)}</ul>
      </details>
    </fieldset>
  );
}
