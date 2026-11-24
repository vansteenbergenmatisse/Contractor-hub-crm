// @vitest-environment happy-dom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/shared/lib/prisma", () => ({ getPrisma: () => ({}) }));
vi.mock("@/features/brand", () => ({ ensureSignInSlugs: vi.fn(), signInPath: (slug: string) => slug }));

import { ClientsTable } from "../../../src/features/admin/components/ClientsTable";
import type { ClientRow } from "../../../src/features/admin/types";

// Wave E: each client row links to the admin values page. Made-up clients.
const row = (over: Partial<ClientRow> = {}): ClientRow => ({ tenantId: "t1", name: "Acme", status: "Connected", login: "on", users: 1, signInPath: null, ...over });

describe("Edit values on /admin/clients", () => {
  it("links each connected client to its values page", () => {
    render(<ClientsTable clients={[row(), row({ tenantId: "t 2", name: "Beta" })]} editValues />);
    expect(screen.getByRole("link", { name: "Edit values for Acme" })).toHaveAttribute("href", "/admin/clients/t1/values");
    expect(screen.getByRole("link", { name: "Edit values for Beta" })).toHaveAttribute("href", "/admin/clients/t%202/values");
  });

  it("offers no link for an uninstalled client or without the prop (View as client)", () => {
    render(<ClientsTable clients={[row({ status: "Uninstalled" })]} editValues />);
    expect(screen.queryByRole("link", { name: /Edit values/ })).toBeNull();
  });

  it("offers no link during View as client", () => {
    render(<ClientsTable clients={[row()]} />);
    expect(screen.queryByRole("link", { name: /Edit values/ })).toBeNull();
  });
});
