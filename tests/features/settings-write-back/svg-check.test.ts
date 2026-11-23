import { describe, expect, it } from "vitest";
import { checkSvg, MAX_SVG_BYTES } from "../../../src/features/settings-write-back/api/svg-check";

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
