// The design's one layer over the app (logic `uxLayer`: `<div id="fx" class="fd-app brand-scope fx-root">`
// in <body>). Search, the shortcut list, the row menu, the swipe strip, the refresh line and the search
// flash ring all draw into the same element, so there is never a second `#fx`. Each user takes the
// layer and gives it back; the layer goes away when the last user that needed it is done.
export const FX_ID = "fx";
export const FX_CLASS = "fd-app brand-scope fx-root";

const users = new WeakMap<HTMLElement, { n: number; made: boolean }>();

export function takeFxLayer(doc: Document = document): HTMLElement {
  let layer = doc.getElementById(FX_ID);
  if (!layer) {
    layer = doc.createElement("div");
    layer.id = FX_ID;
    layer.className = FX_CLASS;
    doc.body.appendChild(layer);
    users.set(layer, { n: 0, made: true });
  }
  const entry = users.get(layer) ?? { n: 0, made: false };
  entry.n += 1;
  users.set(layer, entry);
  return layer;
}

export function giveFxLayer(layer: HTMLElement): void {
  const entry = users.get(layer);
  if (!entry) return;
  entry.n -= 1;
  if (entry.n > 0) return;
  users.delete(layer);
  if (entry.made) layer.remove();
}
