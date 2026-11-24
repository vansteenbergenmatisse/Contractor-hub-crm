// @vitest-environment happy-dom
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/shared/lib/prisma", () => ({ getPrisma: () => ({}) }));
vi.mock("@/features/brand", () => ({ ensureSignInSlugs: vi.fn(), signInPath: (slug: string) => slug }));

import { ClientsTable } from "../../../src/features/admin/components/ClientsTable";
import type { ClientRow } from "../../../src/features/admin/types";

// Review round 1 of feat/template-copy: the panel's batches, resume, hidden keys and template drift.
const row = (over: Partial<ClientRow> = {}): ClientRow => ({ tenantId: "t1", name: "Acme", status: "Connected", login: "on", users: 1, signInPath: null, ...over });
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const PREVIEW = {
  counts: { templateKeys: 5, fill: 2, same: 0, different: 2, missing: 0, duplicates: 0, templateBlank: 0, images: 1, hidden: 2 },
  fill: [
    { key: "business_name", image: false, value: "JCR" },
    { key: "0_webhook_url_form", image: false },
  ],
  same: [],
  different: [
    { key: "business_logo", image: true, token: "tok-logo", templateValue: "https://files.leadconnectorhq.com/jcr", targetValue: "https://files.leadconnectorhq.com/old" },
    { key: "zz_secret", image: false, token: "tok-secret" },
  ],
  missing: [],
  duplicates: [],
  images: ["business_logo"],
  templateDigest: "digest-1",
  templateName: "JCR Roofing",
};

afterEach(() => vi.unstubAllGlobals());

function open(answers: Response[]) {
  const bodies: Record<string, unknown>[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: RequestInit) => {
      bodies.push(JSON.parse(String(init.body)));
      return answers.shift() as Response;
    }),
  );
  render(<ClientsTable clients={[row()]} templateCopy={{ templateTenantId: "tpl", warnings: {} }} />);
  fireEvent.click(screen.getByRole("button", { name: "Copy values from template to Acme" }));
  return bodies;
}

describe("TemplateCopyPanel: review fixes", () => {
  it("names the template and the hidden keys it fills, and offers no tick for a hidden filled key", async () => {
    open([json(PREVIEW)]);
    await screen.findByText(/Nothing has been written yet/);
    expect(screen.getByText(/Template: JCR Roofing/)).toBeTruthy();
    expect(screen.getByRole("note").textContent).toContain("0_webhook_url_form");
    expect(screen.queryByLabelText(/Replace zz_secret/)).toBeNull();
    expect(screen.getByText(/never replaced/, { selector: "div" })).toBeTruthy();
  });

  it("sends the preview's template digest and never retries a key it already replaced", async () => {
    const bodies = open([
      json(PREVIEW),
      json({ status: "ok", results: [{ key: "business_logo", status: "overwritten", image: "uploaded" }], remaining: 1, done: false }),
      json({ status: "ok", results: [{ key: "business_name", status: "filled" }], remaining: 0, done: true }),
    ]);
    await screen.findByText(/Nothing has been written yet/);
    fireEvent.click(screen.getByLabelText(/Replace business_logo/));
    fireEvent.click(screen.getByRole("button", { name: "Copy 3 values" }));
    await screen.findByText(/^Done\./);
    expect(bodies[1]).toEqual({ action: "apply", overwrite: { business_logo: "tok-logo" }, skip: [], templateDigest: "digest-1" });
    expect(bodies[2]).toEqual({ action: "apply", overwrite: { business_logo: "tok-logo" }, skip: ["business_logo"], templateDigest: "digest-1" });
    expect(screen.queryByText(/Changed in HighLevel meanwhile/)).toBeNull();
  });

  it("can continue after a stop, keeping what was already reported", async () => {
    const bodies = open([
      json(PREVIEW),
      json({ status: "ok", results: [{ key: "zz_secret", status: "conflict" }], remaining: 2, done: false }),
      json({ error: "busy" }, 409),
      json({ status: "ok", results: [{ key: "business_name", status: "filled" }], remaining: 0, done: true }),
    ]);
    await screen.findByText(/Nothing has been written yet/);
    fireEvent.click(screen.getByRole("button", { name: "Copy 2 values" }));
    await screen.findByText(/A Settings save for this client is running/);
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await screen.findByText(/^Done\./);
    expect(bodies[3]).toEqual({ action: "apply", overwrite: {}, skip: ["zz_secret"], templateDigest: "digest-1" });
    expect(screen.queryByRole("button", { name: "Continue" })).toBeNull();
  });

  it("does not offer Continue when the template changed since the preview", async () => {
    open([
      json(PREVIEW),
      json({ status: "ok", results: [{ key: "business_name", status: "filled" }], remaining: 1, done: false }),
      json({ error: "template_changed" }, 409),
    ]);
    await screen.findByText(/Nothing has been written yet/);
    fireEvent.click(screen.getByRole("button", { name: "Copy 2 values" }));
    await screen.findByText(/values changed since this preview/);
    expect(screen.queryByRole("button", { name: "Continue" })).toBeNull();
  });
});
