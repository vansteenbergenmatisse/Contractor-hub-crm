"use client";

import { useId, useState } from "react";

type FieldProps = {
  label: string;
  name: string;
  type?: "text" | "email" | "password";
  autoComplete: string;
  value: string;
  onChange: (value: string) => void;
  error?: string | null;
  readOnly?: boolean;
  autoFocus?: boolean;
};

// Label, input and optional error, as in the design (fd-ll, fd-lin, fd-lerr). A password field
// gets the design's "Show" button.
export function Field({ label, name, type = "text", autoComplete, value, onChange, error, readOnly, autoFocus }: FieldProps) {
  const id = useId();
  const [shown, setShown] = useState(false);
  const isPassword = type === "password";
  const input = (
    <input
      id={id}
      name={name}
      className={`fd-lin${error ? " is-bad" : ""}`}
      type={isPassword && shown ? "text" : type}
      autoComplete={autoComplete}
      value={value}
      readOnly={readOnly}
      autoFocus={autoFocus}
      autoCapitalize="none"
      spellCheck={false}
      aria-invalid={error ? true : undefined}
      aria-describedby={error ? `${id}-err` : undefined}
      onChange={(event) => onChange(event.target.value)}
    />
  );
  return (
    <>
      <label className="fd-ll" htmlFor={id}>{label}</label>
      {isPassword ? (
        <div className="fd-lpw">
          {input}
          <button type="button" className="fd-btn is-plain fd-lshow" onClick={() => setShown(!shown)} aria-controls={id} aria-label={`${shown ? "Hide" : "Show"} ${label.toLowerCase()}`}>
            {shown ? "Hide" : "Show"}
          </button>
        </div>
      ) : (
        input
      )}
      {error ? <p className="fd-lerr" id={`${id}-err`} role="alert">{error}</p> : null}
    </>
  );
}
