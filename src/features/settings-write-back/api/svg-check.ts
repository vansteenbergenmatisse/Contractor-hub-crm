import { DOMParser, XMLSerializer } from "@xmldom/xmldom";

// The logo and favicon rule. A strict, rejecting allowlist on a real XML parser: anything not listed
// refuses the whole file, nothing is repaired silently. What is uploaded is the serialized parsed tree,
// so the stored bytes are the ones this check read. Only comments and the XML declaration are dropped.
export const MAX_SVG_BYTES = 512 * 1024;
const MAX_DEPTH = 32;
const MAX_ELEMENTS = 20_000;
const SVG_NS = "http://www.w3.org/2000/svg";
const XLINK_NS = "http://www.w3.org/1999/xlink";
const ELEMENT = 1;
const TEXT = 3;
const CDATA = 4;
const INSTRUCTION = 7;
const COMMENT = 8;

export type SvgCheck = { ok: true; bytes: Uint8Array } | { ok: false; reason: "too_large" | "svg_required" | "svg_unsafe" };

type XmlNode = {
  nodeType: number;
  nodeName: string;
  nodeValue: string | null;
  namespaceURI?: string | null;
  prefix?: string | null;
  childNodes: { length: number; item(i: number): XmlNode | null };
  attributes?: { length: number; item(i: number): { name: string; value: string } | null };
  removeChild(child: XmlNode): unknown;
};

const ELEMENTS: ReadonlySet<string> = new Set(["svg", "g", "defs", "path", "rect", "circle", "ellipse", "line", "polyline", "polygon", "text", "tspan", "title", "desc"]);
const TEXT_ELEMENTS: ReadonlySet<string> = new Set(["text", "tspan", "title", "desc"]);
const PAINT = [
  "fill", "fill-rule", "fill-opacity", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin",
  "stroke-miterlimit", "stroke-dasharray", "stroke-dashoffset", "stroke-opacity", "opacity", "clip-rule",
  "display", "visibility", "font-family", "font-size", "font-weight", "font-style", "text-anchor", "letter-spacing",
];
const STYLE_PROPERTIES: ReadonlySet<string> = new Set(PAINT);
const ATTRIBUTES: ReadonlySet<string> = new Set([
  ...PAINT, "id", "class", "style", "version", "width", "height", "viewBox", "preserveAspectRatio", "x", "y", "x1", "y1", "x2", "y2",
  "cx", "cy", "r", "rx", "ry", "d", "points", "transform", "dx", "dy", "enable-background", "xml:space",
]);
// After the parser decoded character references, so an encoded `url(` is caught too.
const UNSAFE_VALUE = /url\s*\(|javascript:|data:|expression\s*\(|@import|\\|<|[\u0000-\u0008\u000b\u000c\u000e-\u001f]/i;
const STYLE_VALUE = /^[\w#%.,\s()'"+-]*$/;

function isSafeStyle(value: string): boolean {
  for (const part of value.split(";")) {
    if (part.trim() === "") continue;
    const colon = part.indexOf(":");
    if (colon < 1) return false;
    if (!STYLE_PROPERTIES.has(part.slice(0, colon).trim().toLowerCase())) return false;
    if (!STYLE_VALUE.test(part.slice(colon + 1))) return false;
  }
  return true;
}

function isSafeAttribute(name: string, value: string): boolean {
  if (name === "xmlns") return value === SVG_NS;
  if (name === "xmlns:xlink") return value === XLINK_NS;
  if (!ATTRIBUTES.has(name) || UNSAFE_VALUE.test(value)) return false;
  return name !== "style" || isSafeStyle(value);
}

function isSafeElement(node: XmlNode, depth: number, count: { n: number }): boolean {
  count.n += 1;
  if (depth > MAX_DEPTH || count.n > MAX_ELEMENTS) return false;
  if (node.prefix || node.namespaceURI !== SVG_NS || !ELEMENTS.has(node.nodeName)) return false;
  const attributes = node.attributes;
  for (let i = 0; i < (attributes?.length ?? 0); i += 1) {
    const attribute = attributes?.item(i);
    if (!attribute || !isSafeAttribute(attribute.name, attribute.value)) return false;
  }
  const comments: XmlNode[] = [];
  for (let i = 0; i < node.childNodes.length; i += 1) {
    const child = node.childNodes.item(i);
    if (!child) return false;
    if (child.nodeType === COMMENT) comments.push(child);
    else if (child.nodeType === TEXT) {
      if ((child.nodeValue ?? "").trim() !== "" && !TEXT_ELEMENTS.has(node.nodeName)) return false;
    } else if (child.nodeType !== ELEMENT || !isSafeElement(child, depth + 1, count)) return false;
  }
  for (const comment of comments) node.removeChild(comment);
  return true;
}

// Null when the XML is broken or holds a part that is never allowed around the root element.
function parseRoot(text: string): XmlNode | null {
  let doc: XmlNode;
  try {
    doc = new DOMParser({ onError: (level, message) => { throw new Error(`${level}: ${message}`); } }).parseFromString(text, "image/svg+xml") as unknown as XmlNode;
  } catch {
    return null;
  }
  let root: XmlNode | null = null;
  for (let i = 0; i < doc.childNodes.length; i += 1) {
    const child = doc.childNodes.item(i);
    if (!child) return null;
    if (child.nodeType === ELEMENT) root = child;
    else if (child.nodeType === INSTRUCTION) {
      if (child.nodeName !== "xml") return null;
    } else if (child.nodeType === CDATA || child.nodeType !== COMMENT) return null;
  }
  return root;
}

export function checkSvg(bytes: Uint8Array): SvgCheck {
  if (bytes.byteLength > MAX_SVG_BYTES) return { ok: false, reason: "too_large" };
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return { ok: false, reason: "svg_required" };
  }
  if (!text.trimStart().startsWith("<")) return { ok: false, reason: "svg_required" };
  // Refused before parsing, so no entity is ever declared or expanded.
  if (/<!DOCTYPE|<!ENTITY/i.test(text)) return { ok: false, reason: "svg_unsafe" };
  const root = parseRoot(text);
  if (!root) return { ok: false, reason: "svg_unsafe" };
  if (root.nodeName.toLowerCase() !== "svg") return { ok: false, reason: "svg_required" };
  if (!isSafeElement(root, 1, { n: 0 })) return { ok: false, reason: "svg_unsafe" };
  const output = new XMLSerializer().serializeToString(root as never);
  // The serialized text must pass the same check, so a parser quirk cannot change what was approved.
  const again = parseRoot(output);
  if (!again || !isSafeElement(again, 1, { n: 0 })) return { ok: false, reason: "svg_unsafe" };
  const out = new TextEncoder().encode(output);
  return out.byteLength > MAX_SVG_BYTES ? { ok: false, reason: "too_large" } : { ok: true, bytes: out };
}
