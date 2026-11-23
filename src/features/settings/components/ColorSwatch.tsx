import { useRef, useState } from "react";
import { isHexColor } from "../api/live-save";
import { pickerHex } from "../api/image-preview";
import { ColorPad } from "./ColorPad";

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

// A swatch button that opens the color pad. Opening reads the color and writes nothing, so a 3-digit
// or invalid stored value stays as it is until the owner picks a color.
export function ColorSwatch({ fieldKey, label, value, saved, readOnly, onChange }: Props) {
  const button = useRef<HTMLButtonElement>(null);
  const [pad, setPad] = useState<{ hex: string | null; host: Element } | null>(null);

  function toggle() {
    const el = button.current;
    if (pad || !el) {
      setPad(null);
      return;
    }
    const applied = getComputedStyle(el).getPropertyValue(`--${fieldKey.replaceAll("_", "-")}`);
    // Inside the brand scope, so the pad has the client's colors, and outside any animated panel.
    setPad({ hex: pickerHex(value) ?? pickerHex(saved) ?? pickerHex(applied), host: el.closest(".brand-scope") ?? document.body });
  }

  function close() {
    setPad(null);
    button.current?.focus();
  }

  return (
    <>
      <button
        ref={button}
        type="button"
        className="fd-swt"
        style={swatchStyle(fieldKey, value, saved)}
        aria-label={`Pick ${label}`}
        aria-haspopup="dialog"
        aria-expanded={pad !== null}
        disabled={readOnly}
        onClick={toggle}
      />
      {pad ? <ColorPad anchor={button} host={pad.host} label={`Pick ${label}`} startHex={pad.hex} onPick={(hex) => onChange(fieldKey, hex)} onClose={close} /> : null}
    </>
  );
}
