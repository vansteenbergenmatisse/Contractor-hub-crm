// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/shared/lib/prisma", () => ({ getPrisma: () => ({}) }));
vi.mock("@/features/brand", () => ({ ensureSignInSlugs: vi.fn(), signInPath: (slug: string) => slug }));

import { ClientsTable } from "../../../src/features/admin/components/ClientsTable";
import type { ClientRow } from "../../../src/features/admin/types";

const row = (over: Partial<ClientRow> = {}): ClientRow => ({
  tenantId: "t1",
  name: "Acme",
  status: "Connected",
  login: "on",
  users: 1,
  signInPath: null,
  ...over,
});

function openInvite() {
  fireEvent.click(screen.getByRole("button", { name: "Invite owner" }));
  fireEvent.change(screen.getByLabelText("Owner email for Acme"), { target: { value: "owner@acme.test" } });
}

const inviteButton = () => screen.getByRole("button", { name: /Create invite|Creating invite/ });

afterEach(() => vi.unstubAllGlobals());

describe("U2: one invite per click", () => {
  it("sends one request on a double-click and disables the button while pending", async () => {
    let finish: (response: Response) => void = () => {};
    const fetchMock = vi.fn(() => new Promise<Response>((resolve) => (finish = resolve)));
    vi.stubGlobal("fetch", fetchMock);
    render(<ClientsTable clients={[row()]} />);
    openInvite();
    const button = inviteButton();
    fireEvent.click(button);
    fireEvent.click(button);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(inviteButton()).toBeDisabled());
    finish(new Response(JSON.stringify({ link: "https://app.test/invite/x" }), { status: 200 }));
    expect(await screen.findByRole("status")).toHaveTextContent("https://app.test/invite/x");
  });

  it("keeps another client's actions available while one row is pending", async () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => {})));
    render(<ClientsTable clients={[row(), row({ tenantId: "t2", name: "Birch" })]} />);
    fireEvent.click(screen.getAllByRole("button", { name: "Invite owner" })[0]);
    fireEvent.change(screen.getByLabelText("Owner email for Acme"), { target: { value: "owner@acme.test" } });
    fireEvent.click(inviteButton());
    await waitFor(() => expect(inviteButton()).toBeDisabled());
    expect(screen.getByRole("button", { name: "Invite owner" })).toBeEnabled();
  });
});

describe("U3: each invite error has its own message", () => {
  it.each([
    ["email_taken", 409, /already has an account/i],
    ["not_eligible", 422, /could not confirm/i],
    ["tenant_unavailable", 404, /not connected/i],
    ["send_failed", 502, /could not be sent/i],
    ["rate_limited", 429, /too many/i],
    ["forbidden", 403, /permission|sign in/i],
    ["invalid_request", 400, /valid email/i],
  ])("%s", async (code, status, expected) => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: code }), { status })));
    render(<ClientsTable clients={[row()]} />);
    openInvite();
    fireEvent.click(inviteButton());
    expect(await screen.findByRole("status")).toHaveTextContent(expected);
  });

  it("falls back to a plain message when the response is not JSON", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("Server is not configured.", { status: 500 })));
    render(<ClientsTable clients={[row()]} />);
    openInvite();
    fireEvent.click(inviteButton());
    expect(await screen.findByRole("status")).toHaveTextContent(/invite was not created/i);
  });
});

describe("U4: a network failure is shown", () => {
  it("shows a message when the invite request cannot be sent, and allows a retry", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("offline"))));
    render(<ClientsTable clients={[row()]} />);
    openInvite();
    fireEvent.click(inviteButton());
    expect(await screen.findByRole("status")).toHaveTextContent(/could not reach the server/i);
    expect(inviteButton()).toBeEnabled();
  });

  it("shows a message when the login request cannot be sent", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("offline"))));
    render(<ClientsTable clients={[row()]} />);
    fireEvent.click(screen.getByRole("button", { name: "Turn off login" }));
    expect(await screen.findByRole("status")).toHaveTextContent(/could not reach the server/i);
    expect(screen.getByRole("button", { name: "Turn off login" })).toBeEnabled();
  });
});

describe("U7: neutral helper text", () => {
  it("uses the muted text color for the base empty state", () => {
    const css = readFileSync("src/app/globals.css", "utf8");
    const rule = css.match(/\.fd-app \.fd-none\{[^}]*\}/)?.[0] ?? "";
    expect(rule).toContain("color:var(--fd-muted)");
    expect(rule).not.toContain("color:var(--main-hover-color)");
  });
});

describe("U8: narrow screens", () => {
  it("puts the table in a keyboard-reachable horizontal scroll region", () => {
    render(<ClientsTable clients={[row()]} />);
    const region = screen.getByRole("region", { name: "Clients table" });
    expect(region.style.overflowX).toBe("auto");
    expect(region).toHaveAttribute("tabindex", "0");
    expect(region.querySelector("table")).not.toBeNull();
  });
});
