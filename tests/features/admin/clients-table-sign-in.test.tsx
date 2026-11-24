// @vitest-environment happy-dom
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/shared/lib/prisma", () => ({ getPrisma: () => ({}) }));
vi.mock("@/features/brand", () => ({ ensureSignInSlugs: vi.fn(), signInPath: (slug: string) => slug }));

import { ClientsTable } from "../../../src/features/admin/components/ClientsTable";
import type { ClientRow } from "../../../src/features/admin/types";

const row = (over: Partial<ClientRow> = {}): ClientRow => ({
  tenantId: "cm_tenant_1",
  name: "Acme",
  status: "Connected",
  login: "on",
  users: 2,
  signInPath: null,
  ...over,
});
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

afterEach(() => vi.unstubAllGlobals());

function invite() {
  fireEvent.click(screen.getByRole("button", { name: "Invite owner" }));
  fireEvent.change(screen.getByLabelText("Owner email for Acme"), { target: { value: "owner@acme.test" } });
  fireEvent.click(screen.getByRole("button", { name: "Create invite" }));
}

describe("CRM tenant id", () => {
  it("is shown on each client and can be copied", async () => {
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    render(<ClientsTable clients={[row()]} />);
    expect(screen.getByText("cm_tenant_1")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Copy CRM tenant id for Acme" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("cm_tenant_1"));
    expect(await screen.findByRole("status")).toHaveTextContent("Tenant id copied.");
  });
});

describe("Invite owner tells the truth about email", () => {
  it("says the email was not sent when the guard held it back, and shows the link to copy", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ link: "https://crm.test/invite/abc", email: "owner@acme.test", mail: "held" })));
    render(<ClientsTable clients={[row()]} />);
    invite();
    const status = await screen.findByRole("status");
    expect(status).toHaveTextContent("Email not sent: email is switched off for this address. Copy the link below.");
    expect(status).toHaveTextContent("https://crm.test/invite/abc");
    expect(status).not.toHaveTextContent(/email sent/i);
    expect(screen.getByRole("button", { name: "Copy the link for Acme" })).toBeInTheDocument();
  });

  it("gives an existing, never-used account a set-password link instead of failing", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ kind: "set_password", link: "https://crm.test/reset-password?token=T", email: "owner@acme.test", mail: "sent", expiresAt: "2026-11-25T10:00:00.000Z" })));
    render(<ClientsTable clients={[row()]} />);
    invite();
    const status = await screen.findByRole("status");
    expect(status).toHaveTextContent("set-password link");
    expect(status).toHaveTextContent("Email sent to owner@acme.test.");
    expect(status).toHaveTextContent("24 hours");
    expect(status).toHaveTextContent("https://crm.test/reset-password?token=T");
  });

  it("tells the admin to use Forgot password for an account that was used", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ error: "already_active" }, 409)));
    render(<ClientsTable clients={[row()]} />);
    invite();
    expect(await screen.findByRole("status")).toHaveTextContent(/Forgot password/);
  });

  it("says the daily limit stopped the mail", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ kind: "set_password", link: "https://crm.test/r", email: "o@a.test", mail: "capped" })));
    render(<ClientsTable clients={[row()]} />);
    invite();
    expect(await screen.findByRole("status")).toHaveTextContent(/Email not sent: this client reached today's limit/);
  });

  it("copies the shown link and keeps it on screen", async () => {
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    vi.stubGlobal("fetch", vi.fn(async () => json({ link: "https://crm.test/invite/abc", email: "o@a.test", mail: "held" })));
    render(<ClientsTable clients={[row()]} />);
    invite();
    fireEvent.click(await screen.findByRole("button", { name: "Copy the link for Acme" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("https://crm.test/invite/abc"));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Link copied."));
    expect(screen.getByRole("status")).toHaveTextContent("https://crm.test/invite/abc");
  });
});

describe("Users and Send sign-in email", () => {
  const accounts = [
    { userId: "u1", name: "Olive", email: "owner@acme.test", role: "owner", state: "never_signed_in" },
    { userId: "u2", name: "Otto", email: "office@acme.test", role: "office", state: "signed_in" },
  ];

  it("lists the client's users and sends a sign-in email to one who never signed in", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (!init || init.method !== "POST") return json({ users: accounts });
      return json({ kind: "set_password", link: "https://crm.test/reset-password?token=Z", email: "owner@acme.test", mail: "held", expiresAt: "x" });
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<ClientsTable clients={[row()]} />);
    fireEvent.click(screen.getByRole("button", { name: "Show users and sign-in emails for Acme" }));
    const table = await screen.findByRole("table", { name: "Users of Acme" });
    expect(fetchMock).toHaveBeenCalledWith("/api/invites/sign-in-email?tenantId=cm_tenant_1");
    expect(within(table).getByText("Has signed in")).toBeInTheDocument();
    expect(within(table).queryByRole("button", { name: "Send sign-in email to Otto" })).toBeNull();

    fireEvent.click(within(table).getByRole("button", { name: "Send sign-in email to Olive" }));
    const status = await screen.findByRole("status");
    expect(status).toHaveTextContent("Email not sent: email is switched off for this address. Copy the link below.");
    expect(status).toHaveTextContent("https://crm.test/reset-password?token=Z");
    const [, init] = fetchMock.mock.calls.find(([, i]) => i?.method === "POST") as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({ tenantId: "cm_tenant_1", userId: "u1" });
  });

  it("shows a refusal from the server in words", async () => {
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => (init?.method === "POST" ? json({ error: "account_disabled" }, 409) : json({ users: accounts }))));
    render(<ClientsTable clients={[row()]} />);
    fireEvent.click(screen.getByRole("button", { name: "Show users and sign-in emails for Acme" }));
    fireEvent.click(await screen.findByRole("button", { name: "Send sign-in email to Olive" }));
    expect(await screen.findByRole("status")).toHaveTextContent(/login is turned off/i);
  });

  it("says so when the users cannot be loaded", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ error: "forbidden" }, 403)));
    render(<ClientsTable clients={[row()]} />);
    fireEvent.click(screen.getByRole("button", { name: "Show users and sign-in emails for Acme" }));
    expect(await screen.findByText(/Could not load the users/)).toBeInTheDocument();
  });
});
