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
