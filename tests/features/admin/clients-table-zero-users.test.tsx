// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/shared/lib/prisma", () => ({ getPrisma: () => ({}) }));
vi.mock("@/features/brand", () => ({ ensureSignInSlugs: vi.fn(), signInPath: (slug: string) => slug }));

import { ClientsTable } from "../../../src/features/admin/components/ClientsTable";
import type { ClientRow } from "../../../src/features/admin/types";

const row: ClientRow = { tenantId: "t1", name: "Acme", status: "Connected", login: "no users", users: 0, signInPath: null };

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("a client with no users yet", () => {
  it("can have login turned off, so its first HighLevel user cannot arrive", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ affected: 0 }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<ClientsTable clients={[row]} />);
    const off = screen.getByRole("button", { name: "Turn off login" });
    expect(off).toBeEnabled();
    fireEvent.click(off);
    expect(await screen.findByRole("button", { name: "Turn on login" })).toBeEnabled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("goes back to no users when login is turned on again", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ affected: 0 }), { status: 200 })));
    render(<ClientsTable clients={[{ ...row, login: "off" }]} />);
    fireEvent.click(screen.getByRole("button", { name: "Turn on login" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Turn off login" })).toBeEnabled());
    expect(screen.getByText("no users", { exact: false })).toBeInTheDocument();
  });
});
