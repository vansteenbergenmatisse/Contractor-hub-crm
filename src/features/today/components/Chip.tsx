import type { ReactNode } from "react";
import { Glyph, type GlyphName } from "./Glyph";

// Status as a chip: always a word, and an icon where the design has one.
export function Chip({ tone, icon, className, children }: { tone: "warn" | "ok" | "bad" | "plain" | "next"; icon?: GlyphName; className?: string; children: ReactNode }) {
  return (
    <span className={className ?? `fd-chip is-${tone}`}>
      {icon ? <Glyph name={icon} /> : null}
      {children}
    </span>
  );
}
