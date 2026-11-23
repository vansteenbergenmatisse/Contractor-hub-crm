import { isHexColor } from "../api/live-save";
import type { Field } from "../types";

type Props = {
  field: Field;
  value: string;
  saved: string;
  // True when Save stopped on this field.
  invalid: boolean;
  // The message, shown under the field. Left out when the alert at the top of the page carries it.
  error?: string;
  swatch?: boolean;
  onChange: (key: string, value: string) => void;
};

// The swatch shows the saved color when it is a hex color (only a hex color reaches the style
// attribute). Otherwise it shows the color the app applies now: its CSS variable on <html>, which
// holds the client's color or the app's own default.
function swatchStyle(key: string, saved: string): React.CSSProperties {
  return { background: isHexColor(saved) ? saved : `var(--${key.replaceAll("_", "-")})` };
}

export function ValueField({ field, value, saved, invalid, error, swatch, onChange }: Props) {
  const errorId = `cv-${field.key}-err`;
  return (
    <div className="fd-cvf">
      <label className="fd-ll" htmlFor={`cv-${field.key}`}>
        {field.label}
      </label>
      <div className="fd-cvi">
        {swatch ? <span className="fd-swt" style={swatchStyle(field.key, saved)} aria-hidden="true" /> : null}
        <input
          className={`fd-lin${invalid ? " is-bad" : ""}`}
          id={`cv-${field.key}`}
          type="text"
          autoComplete="off"
          spellCheck={false}
          value={value}
          aria-invalid={invalid ? true : undefined}
          aria-describedby={error ? errorId : invalid ? "fd-st-err" : undefined}
          onChange={(e) => onChange(field.key, e.target.value)}
        />
      </div>
      {error ? <p className="fd-lerr" id={errorId} role="alert">{error}</p> : null}
    </div>
  );
}
