import { useEffect, useRef } from "react";
import { isHexColor } from "../api/live-save";
import { pickerHex } from "../api/image-preview";

type Props = {
  fieldKey: string;
  label: string;
  value: string;
  saved: string;
  readOnly?: boolean;
  onChange: (key: string, value: string) => void;
};

// The swatch shows the field's color when it is a hex color, else the saved one (only a hex color
// reaches the style attribute), else the color the app applies now: its CSS variable on <html>.
function swatchStyle(key: string, value: string, saved: string): React.CSSProperties {
  const typed = value.trim();
  return { background: isHexColor(typed) ? typed : isHexColor(saved) ? saved : `var(--${key.replaceAll("_", "-")})` };
}

// A clickable swatch over a native color picker. The picker's value is set on the element and never
// through state, so a 3-digit or invalid stored value stays as it is until the owner picks a color.
export function ColorSwatch({ fieldKey, label, value, saved, readOnly, onChange }: Props) {
  const picker = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const el = picker.current;
    if (!el) return;
    const applied = getComputedStyle(el).getPropertyValue(`--${fieldKey.replaceAll("_", "-")}`);
    const hex = pickerHex(value) ?? pickerHex(saved) ?? pickerHex(applied);
    if (hex) el.value = hex;
  }, [fieldKey, value, saved]);
  return (
    <span className="fd-swt" style={swatchStyle(fieldKey, value, saved)}>
      <input
        ref={picker}
        className="fd-swp"
        type="color"
        aria-label={`Pick ${label}`}
        disabled={readOnly}
        onChange={(e) => onChange(fieldKey, e.target.value.toUpperCase())}
      />
    </span>
  );
}
