import { svgProps } from "./svg-props";

// The three status icons the design puts in every connection chip; CSS shows the one that fits.
export function ChipIcons() {
  return (
    <>
      <svg className="i-w" width="13" height="13" {...svgProps} strokeWidth={2.2}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
      <svg className="i-b" width="13" height="13" {...svgProps} strokeWidth={2.2}><circle cx="12" cy="12" r="9" /><path d="M12 7.5v5M12 16.2v.3" /></svg>
      <svg className="i-o" width="13" height="13" {...svgProps} strokeWidth={2.2}><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
    </>
  );
}
