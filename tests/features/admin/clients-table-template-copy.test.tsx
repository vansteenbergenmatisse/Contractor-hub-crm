// @vitest-environment happy-dom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/shared/lib/prisma", () => ({ getPrisma: () => ({}) }));
vi.mock("@/features/brand", () => ({ ensureSignInSlugs: vi.fn(), signInPath: (slug: string) => slug }));

import { ClientsTable } from "../../../src/features/admin/components/ClientsTable";
import type { ClientRow } from "../../../src/features/admin/types";

const row = (over: Partial<ClientRow> = {}): ClientRow => ({ tenantId: "t1", name: "Acme", status: "Connected", login: "on", users: 1, signInPath: null, ...over });
const template = row({ tenantId: "tpl", name: "JCR" });
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const PREVIEW = {
  counts: { templateKeys: 4, fill: 1, same: 1, different: 2, missing: 1, duplicates: 0, templateBlank: 0, images: 0, hidden: 1 },
  fill: [{ key: "business_name", image: false, value: "JCR" }],
  same: ["business_hours"],
  different: [
    { key: "business_email", image: false, token: "tok-email", templateValue: "a@jcr", targetValue: "me@acme" },
    { key: "zz_secret", image: false, token: "tok-secret" },
  ],
  missing: ["only_template"],
  duplicates: [],
  images: [],
};

afterEach(() => vi.unstubAllGlobals());

describe("ClientsTable: copy values from template", () => {
  it("shows no copy button and no warning while the copy is off", () => {
    render(<ClientsTable clients={[row()]} />);
    expect(screen.queryByRole("button", { name: /Copy values from template/ })).toBeNull();
  });

  it("offers the copy on clients but never on the template's own row", () => {
    render(<ClientsTable clients={[template, row()]} templateCopy={{ templateTenantId: "tpl", warnings: {} }} />);
    expect(screen.getAllByRole("button", { name: /Copy values from template/ })).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Copy values from template to Acme" })).toBeTruthy();
  });

  it("warns on a client still holding template values, never on the template", () => {
    render(<ClientsTable clients={[template, row()]} templateCopy={{ templateTenantId: "tpl", warnings: { t1: ["Business name", "Phone"], tpl: ["Business name"] } }} />);
    const notes = screen.getAllByRole("note");
    expect(notes).toHaveLength(1);
    expect(notes[0].textContent).toContain("still the template's values");
    expect(notes[0].textContent).toContain("Business name, Phone");
  });

  it("previews first, writes only after the click, sends only ticked overwrites, and loops until done", async () => {
    const bodies: unknown[] = [];
    const answers = [
      json(PREVIEW),
      json({ status: "ok", results: [{ key: "business_name", status: "filled" }, { key: "zz_secret", status: "conflict" }], remaining: 1, done: false }),
      json({ status: "ok", results: [{ key: "business_email", status: "overwritten" }], remaining: 0, done: true }),
    ];
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      bodies.push(JSON.parse(String(init.body)));
      return answers.shift() as Response;
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<ClientsTable clients={[template, row()]} templateCopy={{ templateTenantId: "tpl", warnings: {} }} />);
    fireEvent.click(screen.getByRole("button", { name: "Copy values from template to Acme" }));
    await screen.findByText(/Nothing has been written yet\. 1 to fill/);
    expect(bodies).toEqual([{ action: "preview" }]);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/admin/clients/t1/copy-template");
    expect(screen.getByText(/value hidden/)).toBeTruthy();
    expect(screen.getByText(/only_template/)).toBeTruthy();

    fireEvent.click(screen.getByLabelText(/Replace business_email/));
    fireEvent.click(screen.getByRole("button", { name: "Copy 2 values" }));
    await screen.findByText(/^Done\./);
    expect(bodies[1]).toEqual({ action: "apply", overwrite: { business_email: "tok-email" }, skip: [] });
    expect(bodies[2]).toEqual({ action: "apply", overwrite: { business_email: "tok-email" }, skip: ["zz_secret"] });
    expect(screen.getByText(/Filled 1, replaced 1/)).toBeTruthy();
    expect(screen.getByText(/Changed in HighLevel meanwhile/)).toBeTruthy();
  });

  it("shows the server's reason when the preview is refused", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ error: "template_unreadable" }, 409)));
    render(<ClientsTable clients={[row()]} templateCopy={{ templateTenantId: "tpl", warnings: {} }} />);
    fireEvent.click(screen.getByRole("button", { name: "Copy values from template to Acme" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Could not read the template"));
  });
});
