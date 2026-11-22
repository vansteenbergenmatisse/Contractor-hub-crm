import { describe, expect, it } from "vitest";
import { mergeSearchRows, pushRecent, scoreRow, searchRows, type SearchRow } from "@/features/app-shell";

const row = (id: string, page: SearchRow["page"], name: string, sub = ""): SearchRow => ({ id, page, name, sub, href: `/${page}` });
const rows = [
  row("1", "leads", "Maria Alvarez", "Roof leak"),
  row("2", "leads", "Sam Ortiz", "Gutters on Elm Street"),
  row("3", "quotes", "Jordan Reyes", "Shingle repair"),
  row("4", "leads", "Rosa Diaz"),
  row("5", "leads", "Raj Patel"),
  row("6", "leads", "Ruth Bell"),
  row("7", "leads", "Ron Paul"),
];

describe("scoreRow", () => {
  it("ranks name start over word start over inside over sub line, and 0 for no match", () => {
    expect(scoreRow(rows[0], "mar")).toBe(4);
    expect(scoreRow(rows[0], "alv")).toBe(3);
    expect(scoreRow(rows[0], "lva")).toBe(2);
    expect(scoreRow(rows[0], "leak")).toBe(1);
    expect(scoreRow(rows[0], "zzz")).toBe(0);
    expect(scoreRow(rows[0], "  ")).toBe(0);
  });
});

describe("searchRows", () => {
  it("is empty for an empty term", () => {
    expect(searchRows(rows, "", "all")).toEqual([]);
  });

  it("groups by page in the fixed order and finds a street name in the sub line", () => {
    const groups = searchRows(rows, "elm", "all");
    expect(groups.map((g) => g.key)).toEqual(["leads"]);
    expect(groups[0].hits.map((h) => h.id)).toEqual(["2"]);
  });

  it("caps each group at 4 with scope all, shows every hit in a scope, and keeps the total", () => {
    const all = searchRows(rows, "r", "all");
    const leads = all.find((g) => g.key === "leads");
    expect(leads?.hits).toHaveLength(4);
    expect(leads?.total).toBe(6);
    const only = searchRows(rows, "r", "leads");
    expect(only).toHaveLength(1);
    expect(only[0].hits).toHaveLength(6);
  });

  it("puts the better match first: name starts, then a sub line hit", () => {
    const groups = searchRows(rows, "ro", "leads");
    expect(groups[0].hits.map((h) => h.name)).toEqual(["Rosa Diaz", "Ron Paul", "Maria Alvarez"]);
  });

  it("returns nothing for a scope that has no hit", () => {
    expect(searchRows(rows, "maria", "quotes")).toEqual([]);
  });
});

describe("pushRecent", () => {
  it("puts the newest first, drops a case-blind duplicate and keeps 5", () => {
    let r: string[] = [];
    for (const t of ["a", "b", "c", "d", "e", "f"]) r = pushRecent(r, t);
    expect(r).toEqual(["f", "e", "d", "c", "b"]);
    expect(pushRecent(r, "D")).toEqual(["D", "f", "e", "c", "b"]);
    expect(pushRecent(r, "  ")).toEqual(r);
  });
});

describe("mergeSearchRows", () => {
  const base: SearchRow[] = [
    { id: "l1", page: "leads", name: "A", sub: "old", href: "/leads" },
    { id: "q1", page: "quotes", name: "B", sub: "No price yet", href: "/quotes" },
  ];
  it("uses a page's own rows in place of the layout's, and keeps the rest", () => {
    const out = mergeSearchRows(base, { leads: [{ id: "l1", page: "leads", name: "A", sub: "new", href: "/leads" }] });
    expect(out.map((r) => `${r.id}:${r.sub}`).sort()).toEqual(["l1:new", "q1:No price yet"]);
  });
  it("an empty list for a page means that page has no rows now", () => {
    expect(mergeSearchRows(base, { leads: [] }).map((r) => r.id)).toEqual(["q1"]);
  });
  it("ignores rows a page hands in under another page", () => {
    expect(mergeSearchRows(base, { leads: [{ id: "x", page: "quotes", name: "X", sub: "", href: "/quotes" }] }).map((r) => r.id)).toEqual(["q1"]);
  });
});
