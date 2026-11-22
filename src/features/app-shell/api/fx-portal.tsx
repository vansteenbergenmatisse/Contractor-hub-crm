import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { FX_CLASS, FX_ID } from "./fx-layer";

// Puts `content` in the shared `#fx` layer (useFxLayer). Without a document (server render, a markup
// test) it draws the design's own `<div id="fx">` in place; on the client before the layer is taken it
// draws nothing.
export function inFxLayer(content: ReactNode, layer: HTMLElement | null): ReactNode {
  if (typeof document === "undefined") return <div id={FX_ID} className={FX_CLASS}>{content}</div>;
  return layer ? createPortal(content, layer) : null;
}
