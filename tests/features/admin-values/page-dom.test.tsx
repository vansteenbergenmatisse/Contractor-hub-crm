// @vitest-environment happy-dom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AdminValuesPage } from "../../../src/features/admin-values/components/AdminValuesPage";
import type { AdminValuesView } from "../../../src/features/admin-values/types";

// Wave E: the admin values page. Made-up values.
const view = (over: Partial<AdminValuesView> = {}): AdminValuesView => ({
  tenantId: "T1",
  clientName: "Acme",
  writable: true,
  folders: [{
    id: "biz", title: "Business", groups: [{ id: "contact", title: "Name and contact", rows: [
      { key: "business_name", label: "Business name", value: "Test Co", secret: false, locked: false, editable: true },
      { key: "0_webhook_url_form", label: "Webhook", value: "https://hooks.example.test/x", secret: true, locked: false, editable: true },
    ] }],
  }],
  ...over,
});
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

afterEach(() => vi.unstubAllGlobals());

describe("AdminValuesPage", () => {
  it("shows every value, the secret one included, and saves a change for this client", async () => {
    const fetchMock = vi.fn(async () => json({ results: [{ key: "business_name", status: "saved" }] }));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<AdminValuesPage view={view()} />);
    expect(screen.getByDisplayValue("https://hooks.example.test/x")).toBeInTheDocument();
    expect(screen.getByText("Secret: always hidden from the owner")).toBeInTheDocument();
    const box = screen.getByRole("textbox", { name: /Business name/ });
    await user.clear(box);
    await user.type(box, "New Co");
    await user.click(screen.getByRole("button", { name: "Save Business name" }));
    expect(fetchMock).toHaveBeenCalledWith("/api/admin/clients/T1/values", expect.objectContaining({ method: "POST" }));
    const calls = fetchMock.mock.calls as unknown as [string, RequestInit][];
    expect(JSON.parse(String(calls[0][1].body))).toEqual({ action: "save", key: "business_name", expected: "Test Co", value: "New Co" });
    expect(await screen.findByText("Saved.")).toBeInTheDocument();
  });

  it("locks and unlocks a key", async () => {
    const fetchMock = vi.fn(async () => json({ key: "business_name", locked: true }));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<AdminValuesPage view={view()} />);
    await user.click(screen.getByRole("button", { name: "Lock Business name" }));
    expect(await screen.findByRole("button", { name: "Unlock Business name" })).toBeInTheDocument();
    const calls = fetchMock.mock.calls as unknown as [string, RequestInit][];
    expect(JSON.parse(String(calls[0][1].body))).toEqual({ action: "lock", key: "business_name" });
    await user.click(screen.getByRole("button", { name: "Unlock Business name" }));
    expect(await screen.findByRole("button", { name: "Lock Business name" })).toBeInTheDocument();
  });

  it("is read-only with a note when saving to this client is off", () => {
    render(<AdminValuesPage view={view({ writable: false })} />);
    expect(screen.getByRole("note")).toHaveTextContent("Saving to this client is off");
    expect(screen.getByRole("textbox", { name: /Business name/ })).toHaveAttribute("readonly");
    expect(screen.queryByRole("button", { name: /^Save/ })).toBeNull();
    expect(screen.getByRole("button", { name: "Lock Business name" })).toBeInTheDocument();
  });
});
