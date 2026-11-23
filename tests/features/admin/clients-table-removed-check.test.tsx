// @vitest-environment happy-dom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/shared/lib/prisma", () => ({ getPrisma: () => ({}) }));
vi.mock("@/features/brand", () => ({ ensureSignInSlugs: vi.fn(), signInPath: (slug: string) => slug }));

import { ClientsTable } from "../../../src/features/admin/components/ClientsTable";
import type { ClientRow } from "../../../src/features/admin/types";

const row: ClientRow = { tenantId: "t1", name: "Acme", status: "Connected", login: "off", users: 1, signInPath: null };

afterEach(() => vi.unstubAllGlobals());

describe("turning login on when the removed-people check failed", () => {
  it("tells the admin that login is on but the check failed", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ok: true, removedCheck: "failed" }), { status: 200 })));
    render(<ClientsTable clients={[row]} />);
    fireEvent.click(screen.getByRole("button", { name: "Turn on login" }));
    expect(await screen.findByRole("status")).toHaveTextContent(/login is on.*removed from HighLevel/i);
    expect(screen.getByRole("button", { name: "Turn off login" })).toBeInTheDocument();
  });

  it("shows no warning when the check passed", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 })));
    render(<ClientsTable clients={[row]} />);
    fireEvent.click(screen.getByRole("button", { name: "Turn on login" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Turn off login" })).toBeInTheDocument());
    expect(screen.queryByText(/removed from HighLevel/i)).toBeNull();
  });
});
