import { describe, expect, it } from "vitest";
import { parseContactSearch } from "@/features/highlevel";
import { loadLeads } from "@/features/leads";

// All values are fake.
const row = (over: Record<string, unknown> = {}) => ({ id: "c1", locationId: "loc-a", contactName: "Pat Test", email: "pat@example.test", dateAdded: "2026-03-04T10:00:00.000Z", ...over });
const parse = (rows: unknown[], ownEmail?: string | null, extra: Record<string, unknown> = {}) =>
  parseContactSearch({ contacts: rows, total: rows.length, ...extra }, "loc-a", 100, ownEmail);

describe("the business's own contact is not a lead", () => {
  it("leaves out a contact with the business email, ignoring case and spaces", () => {
    const page = parse([row(), row({ id: "own", email: "Office@Example.test " })], " office@example.TEST");
    expect(page.contacts.map((contact) => contact.id)).toEqual(["c1"]);
    expect(page.dropped).toBe(0);
  });

  it("leaves out a contact whose only name is the business email", () => {
    const page = parse([row(), row({ id: "own", email: undefined, contactName: "office@example.test" })], "office@example.test");
    expect(page.contacts.map((contact) => contact.id)).toEqual(["c1"]);
  });

  it("keeps every contact when the business has no email", () => {
    expect(parse([row({ email: undefined, contactName: undefined })], "  ").contacts).toHaveLength(1);
    expect(parse([row()], null).contacts).toHaveLength(1);
  });

  it("never carries the email on a kept contact", () => {
    expect(JSON.stringify(parse([row()], "office@example.test"))).not.toContain("example.test");
  });

  it("does not call a cut-off page with only the business contact empty", async () => {
    const page = parse([row({ email: "office@example.test" })], "office@example.test", { total: 5 });
    expect(page).toMatchObject({ contacts: [], complete: false });
    const out = await loadLeads("t", async () => ({ ok: true as const, ...page }));
    expect(out).toEqual({ state: "unavailable" });
  });

  it("is empty when the business contact was the only one", async () => {
    const page = parse([row({ email: "office@example.test" })], "office@example.test");
    expect(await loadLeads("t", async () => ({ ok: true as const, ...page }))).toEqual({ state: "empty" });
  });
});

describe("contact names", () => {
  const name = (over: Record<string, unknown>) => parse([row(over)]).contacts[0].name;

  it("uses the capitalized first and last name over the same name in lowercase", () => {
    expect(name({ contactName: "pat van test", firstName: "Pat", lastName: "Van Test" })).toBe("Pat Van Test");
  });

  it("keeps the contact name when it is a different name", () => {
    expect(name({ contactName: "Patricia Test", firstName: "Pat", lastName: "Test" })).toBe("Patricia Test");
  });
});
