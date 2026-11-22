import { isHexColor } from "../api/live-save";
import type { Field } from "../types";

type Props = {
  field: Field;
  value: string;
  saved: string;
  // True when Save stopped on this field. The message itself shows once, in the alert at the top
  // of the page (as in the design); the field points to it.
  invalid: boolean;
  swatch?: boolean;
  onChange: (key: string, value: string) => void;
};

// The swatch shows the saved color when it is a hex color (only a hex color reaches the style
// attribute). Otherwise it shows the color the app applies now: its CSS variable on <html>, which
// holds the client's color or the app's own default.
function swatchStyle(key: string, saved: string): React.CSSProperties {
  return { background: isHexColor(saved) ? saved : `var(--${key.replaceAll("_", "-")})` };
}

export function ValueField({ field, value, saved, invalid, swatch, onChange }: Props) {
  return (
    <div className="fd-cvf">
      <label className="fd-ll" htmlFor={`cv-${field.key}`}>
        {field.label}
        <span className="fd-cvk">custom_values.{field.key}</span>
      </label>
      <div className="fd-cvi">
        {swatch ? <span className="fd-swt" style={swatchStyle(field.key, saved)} aria-hidden="true" /> : null}
        <input
          className="fd-lin"
          id={`cv-${field.key}`}
          type="text"
          autoComplete="off"
          spellCheck={false}
          value={value}
          aria-invalid={invalid ? true : undefined}
          aria-describedby={invalid ? "fd-st-err" : undefined}
          onChange={(e) => onChange(field.key, e.target.value)}
        />
      </div>
    </div>
  );
}
