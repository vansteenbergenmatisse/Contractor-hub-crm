// Settings puts saved colors on the page by hand (a `<style id="settings-brand-live">` in <head> and
// custom properties on <html>), outside React. When the signed-in frame goes away (sign-out, another
// tenant in the same tab) they must go too, so one tenant's colors never show to the next sign-in.
// The id is Settings' `LIVE_STYLE_ID`; the shell cannot import Settings (Settings imports the shell).
export const LIVE_BRAND_STYLE_ID = "settings-brand-live";

type Style = Pick<CSSStyleDeclaration, "length" | "item" | "getPropertyValue" | "setProperty" | "removeProperty">;

// The custom properties (`--name`) set inline on an element, by name.
export function customProps(style: Style): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < style.length; i += 1) {
    const name = style.item(i);
    if (name.startsWith("--")) out[name] = style.getPropertyValue(name);
  }
  return out;
}

// Removes the live brand <style> and puts the <html> custom properties back to `before` (what the
// server rendered when the frame opened): added ones are removed, changed ones restored.
export function clearLiveBrand(doc: Document, before: Record<string, string>): void {
  doc.getElementById(LIVE_BRAND_STYLE_ID)?.remove();
  const style = doc.documentElement.style;
  for (const name of Object.keys(customProps(style))) {
    if (!Object.prototype.hasOwnProperty.call(before, name)) style.removeProperty(name);
  }
  for (const [name, value] of Object.entries(before)) {
    if (style.getPropertyValue(name) !== value) style.setProperty(name, value);
  }
}
