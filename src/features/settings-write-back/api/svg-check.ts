import { DOMParser, XMLSerializer } from "@xmldom/xmldom";

// The logo and favicon rule. A strict, rejecting allowlist on a real XML parser. Normal logo features
// are allowed when they stay inside the file: every reference must be a local `#id` that exists, and
// references may not loop or multiply. Comments, `metadata` and editor data (Illustrator, Inkscape,
// Sketch, Figma) are left out of what is uploaded, so the stored bytes are the ones this check read.
export const MAX_SVG_BYTES = 512 * 1024;
const MAX_DEPTH = 32;
// Every node in the file counts: elements, comments, text and whitespace.
const MAX_NODES = 20_000;
// What a renderer would draw after following `use` and paint references.
const MAX_EXPANDED = 100_000;
const MAX_REFERENCE_CHAIN = 16;
const SVG_NS = "http://www.w3.org/2000/svg";
const XLINK_NS = "http://www.w3.org/1999/xlink";
const ELEMENT = 1;
const TEXT = 3;
const CDATA = 4;
const INSTRUCTION = 7;
const COMMENT = 8;

export type SvgProblem = "script" | "outside_link" | "embedded" | "animation" | "doctype" | "style" | "reference" | "too_complex" | "unsupported" | "broken";
export type SvgCheck = { ok: true; bytes: Uint8Array } | { ok: false; reason: "too_large" | "svg_required" | "svg_unsafe" };
export type SvgInspection = { ok: true; bytes: Uint8Array } | { ok: false; reason: "too_large" | "svg_required" | "svg_unsafe"; problem?: SvgProblem };

type XmlAttribute = { name: string; value: string; prefix?: string | null; namespaceURI?: string | null };
type XmlNode = {
  nodeType: number;
  nodeName: string;
  nodeValue: string | null;
  namespaceURI?: string | null;
  prefix?: string | null;
  childNodes: { length: number; item(i: number): XmlNode | null };
  attributes?: { length: number; item(i: number): XmlAttribute | null };
  removeAttributeNode?: (attribute: XmlAttribute) => unknown;
};

// Namespaces design tools add. Their elements and attributes do nothing in a browser and are removed.
const EDITOR_NAMESPACES: ReadonlySet<string> = new Set([
  "http://www.inkscape.org/namespaces/inkscape",
  "http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd",
  "http://www.bohemiancoding.com/sketch/ns",
  "http://www.figma.com/figma/ns",
  "http://ns.adobe.com/AdobeIllustrator/10.0/",
  "http://ns.adobe.com/AdobeSVGViewerExtensions/3.0/",
  "http://ns.adobe.com/Extensibility/1.0/",
  "http://ns.adobe.com/Flows/1.0/",
  "http://ns.adobe.com/Graphs/1.0/",
  "http://ns.adobe.com/ImageReplacement/1.0/",
  "http://ns.adobe.com/SaveForWeb/1.0/",
  "http://ns.adobe.com/Variables/1.0/",
  "http://ns.adobe.com/xap/1.0/",
  "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
  "http://creativecommons.org/ns#",
  "http://purl.org/dc/elements/1.1/",
]);

const ELEMENTS: ReadonlySet<string> = new Set([
  "svg", "g", "defs", "path", "rect", "circle", "ellipse", "line", "polyline", "polygon", "text", "tspan", "title", "desc",
  "linearGradient", "radialGradient", "stop", "clipPath", "mask", "pattern", "use", "style",
]);
const TEXT_ELEMENTS: ReadonlySet<string> = new Set(["text", "tspan", "title", "desc", "style"]);
const HREF_ELEMENTS: ReadonlySet<string> = new Set(["use", "linearGradient", "radialGradient", "pattern"]);
const PROBLEM_ELEMENTS: ReadonlyMap<string, SvgProblem> = new Map([
  ["script", "script"],
  ["foreignobject", "embedded"], ["iframe", "embedded"], ["embed", "embedded"], ["object", "embedded"], ["body", "embedded"],
  ["image", "outside_link"], ["feimage", "outside_link"], ["a", "outside_link"],
  ["animate", "animation"], ["set", "animation"], ["animatetransform", "animation"], ["animatemotion", "animation"],
]);
const PAINT = [
  "fill", "fill-rule", "fill-opacity", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin",
  "stroke-miterlimit", "stroke-dasharray", "stroke-dashoffset", "stroke-opacity", "opacity", "clip-rule",
  "display", "visibility", "font-family", "font-size", "font-weight", "font-style", "text-anchor", "letter-spacing",
  "stop-color", "stop-opacity", "clip-path", "mask", "color", "paint-order", "vector-effect", "shape-rendering",
  "text-rendering", "isolation", "mix-blend-mode", "overflow", "font-variant", "font-stretch", "word-spacing",
  "dominant-baseline", "alignment-baseline", "baseline-shift", "transform-origin",
];
const PAINT_SET: ReadonlySet<string> = new Set(PAINT);
const STYLE_PROPERTIES: ReadonlySet<string> = new Set([...PAINT, "transform"]);
const REFERENCE_PROPERTIES: ReadonlySet<string> = new Set(["fill", "stroke", "clip-path", "mask"]);
const ATTRIBUTES: ReadonlySet<string> = new Set([
  ...PAINT, "id", "class", "style", "version", "width", "height", "viewBox", "preserveAspectRatio", "x", "y", "x1", "y1", "x2", "y2",
  "cx", "cy", "r", "rx", "ry", "d", "points", "transform", "dx", "dy", "enable-background", "xml:space", "xml:lang", "lang",
  "offset", "fx", "fy", "fr", "gradientUnits", "gradientTransform", "spreadMethod", "clipPathUnits", "maskUnits",
  "maskContentUnits", "patternUnits", "patternContentUnits", "patternTransform", "pathLength", "textLength", "lengthAdjust",
  "baseProfile", "data-name", "role", "aria-label", "aria-hidden", "focusable", "type",
]);
const CSS_FUNCTIONS: ReadonlySet<string> = new Set(["rgb", "rgba", "hsl", "hsla", "matrix", "translate", "translatex", "translatey", "scale", "scalex", "scaley", "rotate", "skewx", "skewy"]);
// After the parser decoded character references, so an encoded `url(` is caught too.
const UNSAFE_VALUE = /url\s*\(|javascript:|data:|expression\s*\(|@import|\\|<|[\u0000-\u0008\u000b\u000c\u000e-\u001f]/i;
const STYLE_VALUE = /^[\w#%.,\s()'"+-]*$/;
// An open quote would make a browser read the rules after it differently from this check.
const CLOSED_QUOTES = /^(?:[^'"]|'[^'\n]*'|"[^"\n]*")*$/;
const LOCAL_HREF =/^#([A-Za-z_][\w.-]*)$/;
const LOCAL_PAINT = /url\(#([A-Za-z_][\w.-]*)\)/g;
const SIMPLE_SELECTOR = /^(?:\.[\w-]+|#[\w-]+|[A-Za-z][\w-]*)$/;

type Walk = {
  n: number;
  problem: SvgProblem | null;
  ids: Map<string, XmlNode>;
  repeatedIds: Set<string>;
  references: Map<XmlNode, string[]>;
  // Attributes of editors, removed once the whole file passed.
  strip: [XmlNode, XmlAttribute][];
  sheet: { selector: string; ids: string[] }[];
  elements: XmlNode[];
};
const newWalk = (): Walk => ({ n: 0, problem: null, ids: new Map(), repeatedIds: new Set(), references: new Map(), strip: [], sheet: [], elements: [] });

function fail(walk: Walk, problem: SvgProblem): false {
  walk.problem ??= problem;
  return false;
}

const problemOfValue = (value: string): SvgProblem => (/url\s*\(|@import/i.test(value) ? "outside_link" : /javascript:|expression\s*\(/i.test(value) ? "script" : "unsupported");

function usesOnlySafeFunctions(value: string): boolean {
  for (const match of value.matchAll(/([A-Za-z-]+)\s*\(/g)) {
    if (!CSS_FUNCTIONS.has(match[1].toLowerCase())) return false;
  }
  return true;
}

// Takes the local `url(#id)` references out of a value. What is left must be plain.
function readPaint(property: string, value: string, ids: string[]): string {
  if (!REFERENCE_PROPERTIES.has(property)) return value;
  return value.replace(LOCAL_PAINT, (_all, id: string) => {
    ids.push(id);
    return "";
  });
}

function isSafeDeclarations(value: string, ids: string[]): boolean {
  for (const part of value.split(";")) {
    if (part.trim() === "") continue;
    const colon = part.indexOf(":");
    if (colon < 1) return false;
    const property = part.slice(0, colon).trim().toLowerCase();
    if (!STYLE_PROPERTIES.has(property)) return false;
    const rest = readPaint(property, part.slice(colon + 1), ids);
    if (UNSAFE_VALUE.test(rest) || !STYLE_VALUE.test(rest) || !CLOSED_QUOTES.test(rest) || !usesOnlySafeFunctions(rest)) return false;
  }
  return true;
}

// Only `selector { property: value }` rules: no at-rules, comments, escapes or outside links.
function isSafeSheet(css: string, walk: Walk): boolean {
  if (/@import|url\s*\(\s*(?!#)/i.test(css)) return fail(walk, "outside_link");
  if (/[\\<@]|\/\*/.test(css)) return fail(walk, "style");
  let at = 0;
  for (;;) {
    const open = css.indexOf("{", at);
    if (open < 0) break;
    const close = css.indexOf("}", open);
    if (close < 0) return fail(walk, "style");
    const selectors = css.slice(at, open).split(",").map((part) => part.trim());
    const body = css.slice(open + 1, close);
    if (body.includes("{") || selectors.some((part) => !/^[\w.#\s-]+$/.test(part))) return fail(walk, "style");
    const ids: string[] = [];
    if (!isSafeDeclarations(body, ids)) return fail(walk, "style");
    // A reference is only followed through a selector whose targets can be named exactly.
    if (ids.length > 0) {
      if (selectors.some((part) => !SIMPLE_SELECTOR.test(part))) return fail(walk, "style");
      for (const selector of selectors) walk.sheet.push({ selector, ids });
    }
    at = close + 1;
  }
  return css.slice(at).trim() === "" || fail(walk, "style");
}

function addReference(walk: Walk, node: XmlNode, id: string) {
  const list = walk.references.get(node);
  if (list) list.push(id);
  else walk.references.set(node, [id]);
}

function checkAttribute(node: XmlNode, attribute: XmlAttribute, walk: Walk): boolean {
  const { name, value } = attribute;
  if (/^on/i.test(name)) return fail(walk, "script");
  if (name === "xmlns") return value === SVG_NS || fail(walk, "unsupported");
  if (name === "xmlns:xlink") return value === XLINK_NS || fail(walk, "unsupported");
  if (name.startsWith("xmlns:")) {
    if (value !== SVG_NS && !EDITOR_NAMESPACES.has(value)) return fail(walk, "unsupported");
    walk.strip.push([node, attribute]);
    return true;
  }
  if (attribute.prefix && attribute.prefix !== "xml" && attribute.prefix !== "xlink") {
    if (!EDITOR_NAMESPACES.has(attribute.namespaceURI ?? "")) return fail(walk, "unsupported");
    walk.strip.push([node, attribute]);
    return true;
  }
  if (name === "href" || name === "xlink:href") {
    if (name === "xlink:href" && attribute.namespaceURI !== XLINK_NS) return fail(walk, "outside_link");
    const local = LOCAL_HREF.exec(value);
    if (!local || !HREF_ELEMENTS.has(node.nodeName)) return fail(walk, "outside_link");
    addReference(walk, node, local[1]);
    return true;
  }
  if (node.nodeName === "style") return name === "id" || name === "xml:space" || (name === "type" && value === "text/css") || fail(walk, "style");
  if (!ATTRIBUTES.has(name) || name === "type") return fail(walk, "unsupported");
  if (name === "style") {
    const ids: string[] = [];
    if (!isSafeDeclarations(value, ids)) return fail(walk, UNSAFE_VALUE.test(value) ? problemOfValue(value) : "style");
    for (const id of ids) addReference(walk, node, id);
    return true;
  }
  const ids: string[] = [];
  const rest = readPaint(name, value, ids);
  if (UNSAFE_VALUE.test(rest)) return fail(walk, problemOfValue(rest));
  if ((PAINT_SET.has(name) || name === "transform") && !usesOnlySafeFunctions(rest)) return fail(walk, "unsupported");
  for (const id of ids) addReference(walk, node, id);
  if (name === "id") {
    if (walk.ids.has(value)) walk.repeatedIds.add(value);
    else walk.ids.set(value, node);
  }
  return true;
}

// Dropped from the output, but its nodes still count against the cap.
function countSubtree(node: XmlNode, depth: number, walk: Walk): boolean {
  walk.n += 1;
  if (depth > MAX_DEPTH || walk.n > MAX_NODES) return fail(walk, "too_complex");
  for (let i = 0; i < node.childNodes.length; i += 1) {
    const child = node.childNodes.item(i);
    if (child && !countSubtree(child, depth + 1, walk)) return false;
  }
  return true;
}

const isDropped = (node: XmlNode) =>
  node.nodeType === ELEMENT && (EDITOR_NAMESPACES.has(node.namespaceURI ?? "") || (!node.prefix && node.namespaceURI === SVG_NS && node.nodeName === "metadata"));

function isSafeElement(node: XmlNode, depth: number, walk: Walk): boolean {
  if (isDropped(node)) return countSubtree(node, depth, walk);
  walk.n += 1;
  if (depth > MAX_DEPTH || walk.n > MAX_NODES) return fail(walk, "too_complex");
  if (node.prefix || node.namespaceURI !== SVG_NS || !ELEMENTS.has(node.nodeName)) {
    const local = node.nodeName.slice(node.nodeName.indexOf(":") + 1).toLowerCase();
    return fail(walk, PROBLEM_ELEMENTS.get(local) ?? "unsupported");
  }
  walk.elements.push(node);
  const attributes = node.attributes;
  for (let i = 0; i < (attributes?.length ?? 0); i += 1) {
    const attribute = attributes?.item(i);
    if (!attribute) return fail(walk, "broken");
    if (!checkAttribute(node, attribute, walk)) return false;
  }
  let css = "";
  for (let i = 0; i < node.childNodes.length; i += 1) {
    const child = node.childNodes.item(i);
    if (!child) return fail(walk, "broken");
    if (child.nodeType === ELEMENT) {
      if (node.nodeName === "style") return fail(walk, "style");
      if (!isSafeElement(child, depth + 1, walk)) return false;
      continue;
    }
    walk.n += 1;
    if (walk.n > MAX_NODES) return fail(walk, "too_complex");
    if (child.nodeType === TEXT || (child.nodeType === CDATA && node.nodeName === "style")) {
      if (node.nodeName === "style") css += child.nodeValue ?? "";
      else if ((child.nodeValue ?? "").trim() !== "" && !TEXT_ELEMENTS.has(node.nodeName)) return fail(walk, "unsupported");
    } else if (child.nodeType === COMMENT) {
      // A comment removed from a style sheet would join the text around it.
      if (node.nodeName === "style") return fail(walk, "style");
    } else return fail(walk, "unsupported");
  }
  return node.nodeName !== "style" || isSafeSheet(css, walk);
}

function classesOf(node: XmlNode): string[] {
  for (let i = 0; i < (node.attributes?.length ?? 0); i += 1) {
    const attribute = node.attributes?.item(i);
    if (attribute?.name === "class") return attribute.value.split(/\s+/).filter(Boolean);
  }
  return [];
}

function idOf(node: XmlNode): string | null {
  for (let i = 0; i < (node.attributes?.length ?? 0); i += 1) {
    const attribute = node.attributes?.item(i);
    if (attribute?.name === "id") return attribute.value;
  }
  return null;
}

// Gives each element the references its style sheet rules add to it.
function applySheet(walk: Walk): boolean {
  if (walk.sheet.length === 0) return true;
  const rules = new Map<string, Set<string>>();
  for (const { selector, ids } of walk.sheet) {
    const targets = rules.get(selector) ?? new Set<string>();
    for (const id of ids) targets.add(id);
    rules.set(selector, targets);
  }
  // Many elements times many rules must not become a large amount of work.
  let added = 0;
  for (const node of walk.elements) {
    const id = idOf(node);
    const names = [node.nodeName, ...classesOf(node).map((name) => `.${name}`), ...(id ? [`#${id}`] : [])];
    for (const name of names) {
      for (const target of rules.get(name) ?? []) {
        added += 1;
        if (added > MAX_EXPANDED) return fail(walk, "too_complex");
        addReference(walk, node, target);
      }
    }
  }
  return true;
}

// Every reference exists and is unambiguous, none loops, and following them all stays small.
function areReferencesSafe(root: XmlNode, walk: Walk): boolean {
  for (const { ids } of walk.sheet) {
    for (const id of ids) if (!walk.ids.has(id) || walk.repeatedIds.has(id)) return fail(walk, "reference");
  }
  if (!applySheet(walk)) return false;
  const done = new Map<XmlNode, { size: number; height: number }>();
  const open = new Set<XmlNode>();
  const visit = (node: XmlNode, chain: number): { size: number; height: number } | null => {
    const known = done.get(node);
    if (known) {
      if (chain + known.height > MAX_REFERENCE_CHAIN) {
        fail(walk, "too_complex");
        return null;
      }
      return known;
    }
    if (open.has(node)) {
      fail(walk, "reference");
      return null;
    }
    if (chain > MAX_REFERENCE_CHAIN) {
      fail(walk, "too_complex");
      return null;
    }
    open.add(node);
    let size = 1;
    let height = 0;
    for (let i = 0; i < node.childNodes.length; i += 1) {
      const child = node.childNodes.item(i);
      if (child?.nodeType !== ELEMENT || isDropped(child)) continue;
      const result = visit(child, chain);
      if (!result) return null;
      size += result.size;
      height = Math.max(height, result.height);
    }
    for (const id of walk.references.get(node) ?? []) {
      const target = walk.ids.get(id);
      if (!target || walk.repeatedIds.has(id)) {
        fail(walk, "reference");
        return null;
      }
      const result = visit(target, chain + 1);
      if (!result) return null;
      size += result.size;
      height = Math.max(height, result.height + 1);
    }
    if (size > MAX_EXPANDED) {
      fail(walk, "too_complex");
      return null;
    }
    open.delete(node);
    const value = { size, height };
    done.set(node, value);
    return value;
  };
  if (!visit(root, 0)) return false;
  // Elements no path from the root reached are still inside the root, so all were visited.
  return true;
}

// Null when the XML is broken or holds a part that is never allowed around the root element.
function parseRoot(text: string, walk: Walk): XmlNode | null {
  let doc: XmlNode;
  try {
    doc = new DOMParser({ onError: (level, message) => { throw new Error(`${level}: ${message}`); } }).parseFromString(text, "image/svg+xml") as unknown as XmlNode;
  } catch {
    fail(walk, "broken");
    return null;
  }
  let root: XmlNode | null = null;
  for (let i = 0; i < doc.childNodes.length; i += 1) {
    const child = doc.childNodes.item(i);
    if (!child) {
      fail(walk, "broken");
      return null;
    }
    if (child.nodeType === ELEMENT) {
      root = child;
      continue;
    }
    walk.n += 1;
    if (walk.n > MAX_NODES) {
      fail(walk, "too_complex");
      return null;
    }
    if (child.nodeType === INSTRUCTION) {
      if (child.nodeName !== "xml") {
        fail(walk, "outside_link");
        return null;
      }
    } else if (child.nodeType === CDATA || child.nodeType !== COMMENT) {
      fail(walk, "unsupported");
      return null;
    }
  }
  if (!root) fail(walk, "broken");
  return root;
}

const isSafeTree = (root: XmlNode, walk: Walk) => isSafeElement(root, 1, walk) && areReferencesSafe(root, walk);
const withoutDropped = (node: XmlNode) => (node.nodeType === COMMENT || isDropped(node) ? null : node);
const unsafe = (walk: Walk): SvgInspection => ({ ok: false, reason: "svg_unsafe", problem: walk.problem ?? "unsupported" });

// The check with the specific reason, so the owner can be told what to fix.
export function inspectSvg(bytes: Uint8Array): SvgInspection {
  if (bytes.byteLength > MAX_SVG_BYTES) return { ok: false, reason: "too_large" };
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return { ok: false, reason: "svg_required" };
  }
  if (!text.trimStart().startsWith("<")) return { ok: false, reason: "svg_required" };
  // Refused before parsing, so no entity is ever declared or expanded.
  if (/<!DOCTYPE|<!ENTITY/i.test(text)) return { ok: false, reason: "svg_unsafe", problem: "doctype" };
  const walk = newWalk();
  const root = parseRoot(text, walk);
  if (!root) return unsafe(walk);
  if (root.nodeName.toLowerCase() !== "svg") return { ok: false, reason: "svg_required" };
  if (!isSafeTree(root, walk)) return unsafe(walk);
  for (const [node, attribute] of walk.strip) node.removeAttributeNode?.(attribute);
  // Comments are left out while serializing: removing them one by one is quadratic in this library.
  const output = new XMLSerializer().serializeToString(root as never, { nodeFilter: withoutDropped } as never);
  // The serialized text must pass the same check, so a parser quirk cannot change what was approved.
  const second = newWalk();
  const again = parseRoot(output, second);
  if (!again || !isSafeTree(again, second)) return unsafe(second);
  const out = new TextEncoder().encode(output);
  return out.byteLength > MAX_SVG_BYTES ? { ok: false, reason: "too_large" } : { ok: true, bytes: out };
}

export function checkSvg(bytes: Uint8Array): SvgCheck {
  const result = inspectSvg(bytes);
  return result.ok ? result : { ok: false, reason: result.reason };
}
