import { Node } from "@xmldom/xmldom";
import { describe, expect, it, vi } from "vitest";
import { checkSvg, inspectSvg, MAX_SVG_BYTES } from "../../../src/features/settings-write-back/api/svg-check";

const NS = 'xmlns="http://www.w3.org/2000/svg"';
const bytes = (text: string) => new TextEncoder().encode(text);
const wrap = (inner: string, attrs = "") => `<svg ${NS} viewBox="0 0 10 10"${attrs}>${inner}</svg>`;
const output = (text: string) => {
  const result = checkSvg(bytes(text));
  if (!result.ok) throw new Error(result.reason);
  return new TextDecoder().decode(result.bytes);
};

describe("checkSvg accepts a plain logo", () => {
  it("keeps shapes, and uploads the serialized tree without comments or the XML declaration", () => {
    const out = output(`<?xml version="1.0" encoding="UTF-8"?><!-- made by a tool -->${wrap('<g fill="#112233"><path d="M0 0h10v10z"/><circle cx="5" cy="5" r="2"/></g>')}`);
    expect(out).toContain("<path");
    expect(out).not.toContain("<?xml");
    expect(out).not.toContain("made by a tool");
  });

  it("removes a comment inside the tree", () => {
    expect(output(wrap('<!-- x --><rect width="1" height="1"/>'))).not.toContain("<!--");
  });

  it("accepts safe inline style and text", () => {
    const out = output(wrap('<text x="1" y="2" style="fill:#000;font-size:2px">Green &amp; Co</text>'));
    expect(out).toContain("Green &amp; Co");
  });
});

describe("checkSvg refuses malicious files", () => {
  const unsafe: [string, string][] = [
    ["script", wrap("<script>alert(1)</script>")],
    ["script with a prefix", `<svg ${NS} xmlns:s="http://www.w3.org/2000/svg"><s:script>alert(1)</s:script></svg>`],
    ["upper case script", wrap("<SCRIPT>alert(1)</SCRIPT>")],
    ["foreignObject", wrap("<foreignObject><div xmlns='http://www.w3.org/1999/xhtml'>x</div></foreignObject>")],
    ["XHTML element", wrap("<body xmlns='http://www.w3.org/1999/xhtml'/>")],
    ["onload on the root", wrap("", ' onload="alert(1)"')],
    ["onclick on a shape", wrap('<rect onclick="alert(1)" width="1" height="1"/>')],
    ["ONLOAD in capitals", wrap("", ' ONLOAD="alert(1)"')],
    ["image with external href", wrap('<image href="https://evil.test/a.png"/>')],
    ["use with external href", wrap('<use href="https://evil.test/a.svg#x"/>')],
    ["xlink href", `<svg ${NS} xmlns:xlink="http://www.w3.org/1999/xlink"><a xlink:href="javascript:alert(1)"><rect/></a></svg>`],
    ["href on an allowed element", wrap('<path href="https://evil.test/" d="M0 0"/>')],
    ["animate", wrap('<rect><animate attributeName="x" to="1"/></rect>')],
    ["set", wrap('<rect><set attributeName="onmouseover" to="alert(1)"/></rect>')],
    ["style element", wrap("<style>@import 'https://evil.test/x.css';</style>")],
    ["iframe", wrap("<iframe src='https://evil.test'/>")],
    ["DOCTYPE", `<!DOCTYPE svg>${wrap("")}`],
    ["internal entity", `<!DOCTYPE svg [<!ENTITY x "y">]>${wrap("<title>&x;</title>")}`],
    ["external entity", `<!DOCTYPE svg [<!ENTITY x SYSTEM "file:///etc/passwd">]>${wrap("<title>&x;</title>")}`],
    ["billion laughs", `<!DOCTYPE l [<!ENTITY a "aaaa"><!ENTITY b "&a;&a;&a;">]>${wrap("<title>&b;</title>")}`],
    ["undeclared entity", wrap("<title>&nope;</title>")],
    ["CSS url in fill", wrap('<rect fill="url(https://evil.test/x)"/>')],
    ["local CSS url in fill", wrap('<rect fill="url(#a)"/>')],
    ["CSS url in style", wrap('<rect style="fill:url(https://evil.test/x)"/>')],
    ["escaped CSS url", wrap('<rect style="fill:\\75rl(https://evil.test/x)"/>')],
    ["entity-encoded url", wrap('<rect fill="&#117;rl(https://evil.test/x)"/>')],
    ["CSS comment splitting url", wrap('<rect style="fill:u/**/rl(x)"/>')],
    ["style property not allowed", wrap('<rect style="behavior:x"/>')],
    ["CSS expression", wrap('<rect style="width:expression(alert(1))"/>')],
    ["javascript in a value", wrap('<rect class="javascript:alert(1)"/>')],
    ["data URI in a value", wrap('<rect class="data:text/html,x"/>')],
    ["CDATA", wrap("<title><![CDATA[<script>alert(1)</script>]]></title>")],
    ["processing instruction", `<?xml-stylesheet href="https://evil.test/x.xsl"?>${wrap("")}`],
    ["inner processing instruction", wrap('<?php echo 1; ?><rect/>')],
    ["stray text in a shape group", wrap("<g>hello</g>")],
    ["other xmlns", `<svg xmlns="http://evil.test/ns"/>`],
    ["foreign prefix attribute", wrap('<rect xmlns:x="http://evil.test" x:y="1"/>')],
  ];

  it.each(unsafe)("refuses %s", (_name, text) => {
    expect(checkSvg(bytes(text))).toEqual({ ok: false, reason: "svg_unsafe" });
  });

  it("refuses nesting that is too deep", () => {
    expect(checkSvg(bytes(wrap(`${"<g>".repeat(40)}${"</g>".repeat(40)}`)))).toEqual({ ok: false, reason: "svg_unsafe" });
  });

  it("refuses too many elements", () => {
    expect(checkSvg(bytes(wrap("<g/>".repeat(20_001))))).toEqual({ ok: false, reason: "svg_unsafe" });
  });
});

describe("checkSvg caps every child node", () => {
  const within = (unit: string, kb: number) => unit.repeat(Math.floor((kb * 1024 - 80) / unit.length));

  it.each([
    ["a 512 KB file of comments", wrap(within("<!---->", 512))],
    ["a 209 KB mix of groups and comments", wrap(within("<g/><!---->", 209))],
    ["comments before the root", `${within("<!---->", 512)}${wrap("")}`],
    ["comments after the root", `${wrap("")}${within("<!---->", 512)}`],
    ["comments spread over groups", wrap(`<g>${"<!---->".repeat(10_001)}</g><g>${"<!---->".repeat(10_001)}</g>`)],
    ["one comment over the cap", wrap("<!---->".repeat(20_000))],
    ["whitespace between too many groups", wrap("<g/> ".repeat(10_001))],
  ])("refuses %s", (_name, text) => {
    expect(checkSvg(bytes(text))).toEqual({ ok: false, reason: "svg_unsafe" });
  });

  it("accepts a file at the cap and drops its comments", () => {
    expect(output(wrap("<!---->".repeat(19_999)))).not.toContain("<!--");
  });

  it("never removes comments one at a time, which is quadratic", () => {
    const removeChild = vi.spyOn(Node.prototype, "removeChild");
    output(wrap('<!-- a --><g><!-- b --><rect width="1" height="1"/></g><!-- c -->'));
    expect(removeChild).not.toHaveBeenCalled();
    removeChild.mockRestore();
  });
});

const XL = 'xmlns:xlink="http://www.w3.org/1999/xlink"';
const withXlink = (inner: string) => `<svg ${NS} ${XL} viewBox="0 0 10 10">${inner}</svg>`;
const GRADIENT = '<linearGradient id="g"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#000"/></linearGradient>';

describe("checkSvg allows what real logos use", () => {
  it.each([
    ["gradient fill", wrap(`<defs>${GRADIENT}</defs><rect width="1" height="1" fill="url(#g)"/>`)],
    ["radial gradient", wrap('<defs><radialGradient id="r" cx="5" cy="5" r="5" fx="4" fy="4" gradientUnits="userSpaceOnUse" gradientTransform="rotate(45)"><stop offset="0" style="stop-color:#fff;stop-opacity:0.5"/></radialGradient></defs><circle r="1" stroke="url(#r)"/>')],
    ["gradient inheriting by xlink", withXlink(`<defs>${GRADIENT}<linearGradient id="h" xlink:href="#g"/></defs><rect fill="url(#h)"/>`)],
    ["clip path", wrap('<defs><clipPath id="c" clipPathUnits="userSpaceOnUse"><rect width="5" height="5"/></clipPath></defs><g clip-path="url(#c)"><rect/></g>')],
    ["mask", wrap('<mask id="m" maskUnits="userSpaceOnUse"><rect fill="#fff"/></mask><rect mask="url(#m)"/>')],
    ["pattern", wrap('<defs><pattern id="p" patternUnits="userSpaceOnUse" width="2" height="2"><rect width="1" height="1"/></pattern></defs><rect fill="url(#p)"/>')],
    ["use with href", wrap('<defs><path id="a" d="M0 0h1"/></defs><use href="#a" x="1"/><use href="#a" x="2"/>')],
    ["use with xlink:href", withXlink('<defs><path id="a" d="M0 0h1"/></defs><use xlink:href="#a"/>')],
    ["paint in a style attribute", wrap(`<defs>${GRADIENT}</defs><rect style="fill:url(#g);stroke:#000"/>`)],
    ["Illustrator style sheet", wrap(`<defs><style>.cls-1{fill:url(#g);}.cls-2,.cls-3{fill:#fff;isolation:isolate}</style>${GRADIENT}</defs><g id="Layer_1" data-name="Layer 1"><path class="cls-1" d="M0 0"/><path class="cls-2" d="M1 1"/></g>`)],
    ["style sheet in CDATA", wrap('<style type="text/css"><![CDATA[.a{fill:#123456}]]></style><rect class="a"/>')],
    ["title and desc", wrap('<title>Logo</title><desc>Our logo</desc><rect/>')],
  ])("accepts %s", (_name, text) => {
    expect(checkSvg(bytes(text)).ok).toBe(true);
  });

  it("removes metadata, whatever it holds", () => {
    const out = output(wrap('<metadata><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><script>alert(1)</script></rdf:RDF></metadata><rect/>'));
    expect(out).not.toContain("metadata");
    expect(out).not.toContain("alert");
  });

  it("strips Inkscape and Sodipodi data", () => {
    const out = output(`<svg ${NS} xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" xmlns:sodipodi="http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd" inkscape:version="1.3" sodipodi:docname="logo.svg"><sodipodi:namedview id="base"/><g inkscape:label="Layer" inkscape:groupmode="layer"><rect/></g></svg>`);
    expect(out).not.toMatch(/inkscape|sodipodi/);
    expect(out).toContain("<rect");
  });

  it("strips Illustrator and Sketch data", () => {
    const out = output(`<svg ${NS} xmlns:i="http://ns.adobe.com/AdobeIllustrator/10.0/" xmlns:sketch="http://www.bohemiancoding.com/sketch/ns"><g i:extraneous="self" sketch:type="MSPage"><rect/></g></svg>`);
    expect(out).not.toMatch(/adobe|sketch|extraneous/);
  });

  it("removes a script hidden inside an editor element", () => {
    const out = output(`<svg ${NS} xmlns:sodipodi="http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd"><sodipodi:namedview><script xmlns="${"http://www.w3.org/2000/svg"}">alert(1)</script></sodipodi:namedview><rect/></svg>`);
    expect(out).not.toContain("alert");
  });
});

describe("checkSvg refuses a bypass of each allowance", () => {
  const unsafe: [string, string][] = [
    ["use to an outside file", wrap('<use href="https://evil.test/a.svg#x"/>')],
    ["use to a protocol-relative file", wrap('<use href="//evil.test/a.svg#x"/>')],
    ["use with a data URI", wrap('<use href="data:image/svg+xml,x#a"/>')],
    ["use with a file and a fragment", wrap('<path id="a"/><use href="a.svg#a"/>')],
    ["xlink use outside", withXlink('<use xlink:href="https://evil.test/a.svg#x"/>')],
    ["href with spaces before the hash", wrap('<path id="a"/><use href=" #a"/>')],
    ["href with javascript", wrap('<use href="javascript:alert(1)"/>')],
    ["xlink prefix bound elsewhere", `<svg ${NS} xmlns:xlink="http://evil.test/ns"><path id="a"/><use xlink:href="#a"/></svg>`],
    ["another prefix for xlink", `<svg ${NS} xmlns:q="http://www.w3.org/1999/xlink"><path id="a"/><use q:href="#a"/></svg>`],
    ["href on a shape", wrap('<path id="a"/><rect href="#a"/>')],
    ["href on stop", wrap(`${GRADIENT}<stop href="#g"/>`)],
    ["reference to a missing id", wrap('<use href="#nope"/>')],
    ["paint to a missing id", wrap('<rect fill="url(#nope)"/>')],
    ["paint to an outside file", wrap(`${GRADIENT}<rect fill="url(https://evil.test/a.svg#g)"/>`)],
    ["paint to a file with a fragment", wrap(`${GRADIENT}<rect fill="url(a.svg#g)"/>`)],
    ["quoted outside paint", wrap(`${GRADIENT}<rect fill="url('https://evil.test/#g')"/>`)],
    ["local paint followed by outside paint", wrap(`${GRADIENT}<rect fill="url(#g) url(https://evil.test/x)"/>`)],
    ["url on a property that takes none", wrap(`${GRADIENT}<rect opacity="url(#g)"/>`)],
    ["url in upper case", wrap(`${GRADIENT}<rect fill="URL(https://evil.test/x)"/>`)],
    ["image-set in a style attribute", wrap('<rect style="fill:image-set(evil)"/>')],
    ["element() in a fill", wrap('<rect fill="element(x)"/>')],
    ["use pointing at itself", wrap('<use id="a" href="#a"/>')],
    ["use loop", wrap('<g id="a"><use href="#b"/></g><g id="b"><use href="#a"/></g>')],
    ["use of the root", `<svg ${NS} id="r"><use href="#r"/></svg>`],
    ["pattern loop by fill", wrap('<pattern id="a"><rect fill="url(#b)"/></pattern><pattern id="b"><rect fill="url(#a)"/></pattern>')],
    ["gradient href loop", wrap('<linearGradient id="a" href="#b"/><linearGradient id="b" href="#a"/>')],
    ["loop through a style sheet class", wrap('<style>.x{fill:url(#p)}</style><pattern id="p"><rect class="x"/></pattern><rect class="x"/>')],
    ["reference to a repeated id", wrap('<path id="a"/><path id="a"/><use href="#a"/>')],
    ["use billion laughs", wrap(`<g id="a0"><path/></g>${Array.from({ length: 15 }, (_, i) => `<g id="a${i + 1}">${`<use href="#a${i}"/>`.repeat(10)}</g>`).join("")}`)],
    ["a long chain of references", wrap(`<g id="a0"/>${Array.from({ length: 40 }, (_, i) => `<g id="a${i + 1}"><use href="#a${i}"/></g>`).join("")}`)],
    ["@import", wrap("<style>@import url(https://evil.test/x.css);</style>")],
    ["@import without url", wrap("<style>@import 'x.css';</style>")],
    ["@font-face", wrap("<style>@font-face{font-family:x;src:url(https://evil.test/f)}</style>")],
    ["@media", wrap("<style>@media screen{.a{fill:red}}</style>")],
    ["external url in a rule", wrap("<style>.a{fill:url(https://evil.test/x)}</style>")],
    ["background image rule", wrap("<style>.a{background:url(x.png)}</style>")],
    ["CSS expression", wrap("<style>.a{fill:expression(alert(1))}</style>")],
    ["behavior", wrap("<style>.a{behavior:url(x.htc)}</style>")],
    ["moz-binding", wrap("<style>.a{-moz-binding:url(x.xml)}</style>")],
    ["CSS escape", wrap("<style>.a{fill:\\75rl(x)}</style>")],
    ["CSS comment", wrap("<style>.a{fill:u/**/rl(x)}</style>")],
    ["XML comment splitting a style sheet", wrap("<style>.a{fill:u<!-- -->rl(https://evil.test/x)}</style>")],
    ["entity-encoded url in a rule", wrap("<style>.a{fill:&#117;rl(https://evil.test/x)}</style>")],
    ["CDATA hiding an import", wrap("<style><![CDATA[@import 'https://evil.test/x.css';]]></style>")],
    ["attribute selector", wrap("<style>[href]{fill:red}</style>")],
    ["pseudo selector", wrap("<style>.a:hover{fill:red}</style>")],
    ["unclosed rule", wrap("<style>.a{fill:red</style>")],
    ["text outside a rule", wrap("<style>.a{fill:red} junk</style>")],
    ["nested rule", wrap("<style>.a{.b{fill:red}}</style>")],
    ["element inside style", wrap("<style><rect/></style>")],
    ["an open quote hiding the next rule", wrap(`<style>.a{font-family:"x}.b{fill:red}</style>`)],
    ["many rules times many elements", wrap(`${GRADIENT.replace('id="g"', 'id="g0"')}${Array.from({ length: 400 }, (_, i) => `<path id="p${i}"/>`).join("")}<style>${Array.from({ length: 400 }, (_, i) => `path{fill:url(#p${i})}`).join("")}</style>`)],
    ["style with another type", wrap('<style type="text/xsl">.a{fill:red}</style>')],
    ["unknown namespace element", `<svg ${NS} xmlns:x="http://evil.test/ns"><x:thing/></svg>`],
    ["script in the SVG namespace by prefix", `<svg ${NS} xmlns:svg="http://www.w3.org/2000/svg"><svg:script>alert(1)</svg:script></svg>`],
    ["on* on a gradient stop", wrap('<linearGradient id="g"><stop onload="alert(1)"/></linearGradient>')],
    ["on* on use", wrap('<path id="a"/><use href="#a" onclick="alert(1)"/>')],
    ["script inside defs", wrap("<defs><script>alert(1)</script></defs>")],
    ["foreignObject inside a mask", wrap('<mask id="m"><foreignObject/></mask>')],
    ["image inside a pattern", wrap('<pattern id="p"><image href="https://evil.test/a.png"/></pattern>')],
    ["animate inside a gradient", wrap('<linearGradient id="g"><animate attributeName="x1" to="1"/></linearGradient>')],
  ];

  it.each(unsafe)("refuses %s", (_name, text) => {
    expect(checkSvg(bytes(text))).toEqual({ ok: false, reason: "svg_unsafe" });
  });
});

describe("checkSvg stays fast on hostile sizes", () => {
  const fast = (text: string) => {
    const started = performance.now();
    const result = checkSvg(bytes(text));
    return { result, ms: performance.now() - started };
  };

  it.each([
    ["a long word in a fill", wrap(`<rect fill="${"a".repeat(80_000)}"/>`)],
    ["a long hyphenated word", wrap(`<rect stroke="${"a-".repeat(40_000)}"/>`)],
    ["a long word in a style", wrap(`<rect style="fill:${"a".repeat(80_000)}"/>`)],
    ["a long word in a rule", wrap(`<style>.a{fill:${"a".repeat(80_000)}}</style>`)],
    ["spaces before a bracket", wrap(`<rect fill="a${" ".repeat(80_000)}b"/>`)],
  ])("%s", (_name, text) => {
    expect(fast(text).ms).toBeLessThan(1_000);
  });

  it("refuses 100k selectors times 30k references without doing that work", () => {
    const selectors = Array.from({ length: 100_000 }, () => "a").join(",");
    const declarations = `fill:${"url(#g)".repeat(30_000)}`;
    const text = wrap(`${GRADIENT}<style>${selectors}{${declarations}}</style><rect class="a"/>`);
    expect(text.length).toBeLessThan(MAX_SVG_BYTES);
    const { result, ms } = fast(text);
    expect(result).toEqual({ ok: false, reason: "svg_unsafe" });
    expect(ms).toBeLessThan(2_000);
  });

  it("counts selector and reference work across rules", () => {
    const rule = `${Array.from({ length: 400 }, (_, i) => `.c${i}`).join(",")}{${"fill:url(#g);".repeat(30)}}`;
    const { result, ms } = fast(wrap(`${GRADIENT}<style>${rule.repeat(10)}</style><rect class="c1"/>`));
    expect(result).toEqual({ ok: false, reason: "svg_unsafe" });
    expect(ms).toBeLessThan(2_000);
  });

  it("still accepts a normal sheet with many classes", () => {
    const rules = Array.from({ length: 200 }, (_, i) => `.c${i}{fill:url(#g)}`).join("");
    expect(checkSvg(bytes(wrap(`${GRADIENT}<style>${rules}</style><rect class="c1"/>`))).ok).toBe(true);
  });
});

describe("inspectSvg names the problem", () => {
  it.each([
    ["script", wrap("<script>alert(1)</script>")],
    ["script", wrap('<rect onclick="alert(1)"/>')],
    ["outside_link", wrap('<use href="https://evil.test/a.svg#x"/>')],
    ["outside_link", wrap('<image href="https://evil.test/a.png"/>')],
    ["outside_link", wrap('<rect fill="url(https://evil.test/x)"/>')],
    ["outside_link", wrap("<style>@import 'x.css';</style>")],
    ["embedded", wrap("<foreignObject/>")],
    ["animation", wrap('<rect><animate attributeName="x" to="1"/></rect>')],
    ["doctype", `<!DOCTYPE svg>${wrap("")}`],
    ["style", wrap("<style>.a:hover{fill:red}</style>")],
    ["reference", wrap('<use href="#nope"/>')],
    ["too_complex", wrap("<g/>".repeat(20_001))],
    ["unsupported", wrap("<filter/>")],
    ["broken", wrap("<title>&nope;</title>")],
  ] as const)("%s", (problem, text) => {
    expect(inspectSvg(bytes(text))).toEqual({ ok: false, reason: "svg_unsafe", problem });
  });
});

describe("checkSvg refuses what is not an SVG", () => {
  it.each([
    ["plain text", "hello"],
    ["broken XML", `<svg ${NS}><g></svg>`],
    ["HTML root", "<html></html>"],
    ["empty", ""],
  ])("refuses %s", (_name, text) => {
    const result = checkSvg(bytes(text));
    expect(result.ok).toBe(false);
  });

  it("refuses bytes that are not UTF-8", () => {
    expect(checkSvg(new Uint8Array([0x3c, 0xff, 0xfe, 0x00])).ok).toBe(false);
  });

  it("refuses a PNG with an svg file name, by its bytes", () => {
    expect(checkSvg(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toEqual({ ok: false, reason: "svg_required" });
  });

  it("refuses a file over 512 KB", () => {
    expect(MAX_SVG_BYTES).toBe(512 * 1024);
    expect(checkSvg(new Uint8Array(MAX_SVG_BYTES + 1))).toEqual({ ok: false, reason: "too_large" });
  });
});
