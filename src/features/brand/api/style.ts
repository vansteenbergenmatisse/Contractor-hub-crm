import type { CSSProperties } from "react";
import type { Brand } from "../types";

// The brand's CSS variables as a React style object for <html>. Values are already validated hex.
export function brandStyle(brand: Brand): CSSProperties {
  return brand.cssVars as CSSProperties;
}

const VAR_NAME = /^--[a-z0-9-]+$/;
const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

// The same variables as one CSS rule for a <style> in <head>. Needed because the design CSS
// re-declares its default colors on `.brand-scope` (the app frame and its sheets), which beats the
// variables inherited from <html>; this rule is more specific than the defaults. Only plain
// variable names with hex colors pass, so a value can never close the rule or the <style> tag.
export function brandScopeCss(brand: Pick<Brand, "cssVars">): string {
  const body = Object.entries(brand.cssVars)
    .filter(([name, value]) => VAR_NAME.test(name) && HEX.test(value))
    .map(([name, value]) => `${name}:${value}`)
    .join(";");
  return body ? `:root:root:root,.brand-scope.brand-scope.brand-scope{${body}}` : "";
}
