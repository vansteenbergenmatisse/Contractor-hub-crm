// @vitest-environment happy-dom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { prisma, ensureSignInSlugs } = vi.hoisted(() => ({
  prisma: { tenant: { findMany: vi.fn() }, user: { findMany: vi.fn() } },
  ensureSignInSlugs: vi.fn(),
}));
vi.mock("@/shared/lib/prisma", () => ({ getPrisma: () => prisma }));
vi.mock("@/features/brand", () => ({
  ensureSignInSlugs,
  signInPath: (slug: string) => `/sign-in?client=${slug}`,
}));

import { ClientsTable } from "../../../src/features/admin/components/ClientsTable";
import { listClients } from "../../../src/features/admin/db/clients";
import type { ClientRow } from "../../../src/features/admin/types";

const row = (over: Partial<ClientRow> = {}): ClientRow => ({
  tenantId: "t1",
  name: "Acme",
  status: "Connected",
  login: "on",
  users: 1,
  signInPath: "/sign-in?client=acme",
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  prisma.tenant.findMany.mockResolvedValue([{ id: "t1", name: "Acme", locationId: "loc_private", status: "connected" }]);
  prisma.user.findMany.mockResolvedValue([]);
});

describe("listClients", () => {
  it("adds each client's personal link from its slug", async () => {
    ensureSignInSlugs.mockResolvedValue(new Map([["t1", "acme"]]));
    const [client] = await listClients();
    expect(client.signInPath).toBe("/sign-in?client=acme");
    expect(ensureSignInSlugs).toHaveBeenCalledWith([{ id: "t1", name: "Acme" }]);
  });

  it("still lists the client when no slug exists (table missing)", async () => {
    ensureSignInSlugs.mockResolvedValue(new Map());
    const [client] = await listClients();
    expect(client.name).toBe("Acme");
    expect(client.signInPath).toBeNull();
  });

  it("still lists the client when slug creation throws", async () => {
    ensureSignInSlugs.mockRejectedValue(new Error("no table"));
    const [client] = await listClients();
    expect(client.signInPath).toBeNull();
  });
});

describe("ClientsTable personal link", () => {
  it("shows the link and copies the full address", async () => {
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    render(<ClientsTable clients={[row()]} />);
    expect(screen.getByText("/sign-in?client=acme")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Copy sign-in link for Acme" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/sign-in?client=acme`));
    expect(await screen.findByRole("status")).toHaveTextContent("Link copied.");
  });

  it("says so when copying fails", async () => {
    Object.defineProperty(navigator, "clipboard", { value: { writeText: vi.fn(async () => { throw new Error("denied"); }) }, configurable: true });
    render(<ClientsTable clients={[row()]} />);
    fireEvent.click(screen.getByRole("button", { name: "Copy sign-in link for Acme" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Could not copy");
  });

  it("shows no copy control when the client has no link yet", () => {
    render(<ClientsTable clients={[row({ signInPath: null })]} />);
    expect(screen.queryByRole("button", { name: /copy sign-in link/i })).toBeNull();
    expect(screen.getByText("Not available yet")).toBeInTheDocument();
  });
});

describe("ClientsTable row actions", () => {
  const two = [row(), row({ tenantId: "t2", name: "Birch", signInPath: "/sign-in?client=birch" })];
  const inviteButtons = () => screen.getAllByRole("button", { name: "Invite owner" });

  it("does not carry one client's owner email to another client's invite", () => {
    render(<ClientsTable clients={two} />);
    fireEvent.click(inviteButtons()[0]);
    fireEvent.change(screen.getByLabelText("Owner email for Acme"), { target: { value: "owner@acme.test" } });
    fireEvent.click(screen.getByRole("button", { name: "Invite owner" }));
    expect(screen.getByLabelText("Owner email for Birch")).toHaveValue("");
    expect(screen.getByRole("button", { name: "Create invite" })).toBeDisabled();
  });

  it("clears the owner email on cancel", () => {
    render(<ClientsTable clients={two} />);
    fireEvent.click(inviteButtons()[0]);
    fireEvent.change(screen.getByLabelText("Owner email for Acme"), { target: { value: "owner@acme.test" } });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(inviteButtons()[0]);
    expect(screen.getByLabelText("Owner email for Acme")).toHaveValue("");
  });

  it("shows a result directly under the client it belongs to", async () => {
    Object.defineProperty(navigator, "clipboard", { value: { writeText: vi.fn(async () => {}) }, configurable: true });
    render(<ClientsTable clients={two} />);
    fireEvent.click(screen.getByRole("button", { name: "Copy sign-in link for Birch" }));
    const status = await screen.findByRole("status");
    const birchRow = screen.getByText("Birch").closest("tr") as HTMLTableRowElement;
    expect(birchRow.nextElementSibling).toBe(status.closest("tr"));
    expect(status.closest("td")).toHaveAttribute("colspan", "6");
  });

  it("shows the invite link under the invited client", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ link: "https://app.test/invite/x" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<ClientsTable clients={two} />);
    fireEvent.click(inviteButtons()[1]);
    fireEvent.change(screen.getByLabelText("Owner email for Birch"), { target: { value: "owner@birch.test" } });
    fireEvent.click(screen.getByRole("button", { name: "Create invite" }));
    const status = await screen.findByRole("status");
    expect(status).toHaveTextContent("https://app.test/invite/x");
    const birchRow = screen.getByText("Birch").closest("tr") as HTMLTableRowElement;
    expect(birchRow.nextElementSibling).toBe(status.closest("tr"));
    vi.unstubAllGlobals();
  });
});
