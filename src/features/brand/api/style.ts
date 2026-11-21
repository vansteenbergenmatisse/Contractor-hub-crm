import type { CSSProperties } from "react";
import type { Brand } from "../types";

// The brand's CSS variables as a React style object for <html>. Values are already validated hex.
export function brandStyle(brand: Brand): CSSProperties {
  return brand.cssVars as CSSProperties;
}
