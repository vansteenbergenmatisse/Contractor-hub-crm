import type { ReactNode } from "react";
import type { Field } from "../types";
import { ColorSwatch } from "./ColorSwatch";

type Props = {
  field: Field;
  value: string;
  saved: string;
  // True when Save stopped on this field.
  invalid: boolean;
  // The message, shown under the field. Left out when the alert at the top of the page carries it.
  error?: string;
  swatch?: boolean;
  readOnly?: boolean;
  // Short lines under the field, read out with it.
  helpers?: readonly string[];
  // Shown under the field, for example an image preview.
  children?: ReactNode;
  wide?: boolean;
  onChange: (key: string, value: string) => void;
};

export function ValueField({ field, value, saved, invalid, error, swatch, readOnly, helpers = [], children, wide, onChange }: Props) {
  const errorId = `cv-${field.key}-err`;
  const helperId = `cv-${field.key}-help`;
  const describedBy = [error ? errorId : invalid ? "fd-st-err" : null, helpers.length > 0 ? helperId : null].filter(Boolean).join(" ") || undefined;
  return (
    <div className={`fd-cvf${wide ? " is-wide" : ""}`}>
      <label className="fd-ll" htmlFor={`cv-${field.key}`}>
        {field.label}
      </label>
      <div className="fd-cvi">
        {swatch ? <ColorSwatch fieldKey={field.key} label={field.label} value={value} saved={saved} readOnly={readOnly} onChange={onChange} /> : null}
        <input
          className={`fd-lin${invalid ? " is-bad" : ""}`}
          id={`cv-${field.key}`}
          type="text"
          autoComplete="off"
          spellCheck={false}
          value={value}
          readOnly={readOnly}
          aria-invalid={invalid ? true : undefined}
          aria-describedby={describedBy}
          onChange={(e) => onChange(field.key, e.target.value)}
        />
      </div>
      {helpers.length > 0 ? <p className="fd-hint fd-cvh" id={helperId}>{helpers.join(". ")}</p> : null}
      {children}
      {error ? <p className="fd-lerr" id={errorId} role="alert">{error}</p> : null}
    </div>
  );
}
