// @vitest-environment happy-dom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AdminValuesPage } from "../../../src/features/admin-values/components/AdminValuesPage";
import type { AdminValueRow, AdminValuesView } from "../../../src/features/admin-values/types";

// Wave E review fixes: keyboard focus, announcements, narrow screens. Made-up values.
const view = (rows: AdminValueRow[]): AdminValuesView => ({
  tenantId: "T1",
  clientName: "Acme",
  writable: true,
  folders: [{ id: "biz", title: "Business", groups: [{ id: "g", title: "G", rows }] }],
});
const NAME: AdminValueRow = { key: "business_name", label: "Business name", value: "Test Co", secret: false, locked: false, editable: true };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

afterEach(() => vi.unstubAllGlobals());

describe("AdminValuesPage review fixes", () => {
  it("keeps keyboard focus on Save after a save, and announces the result in a region that was already there", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ results: [{ key: "business_name", status: "saved" }] })));
    const user = userEvent.setup();
    render(<AdminValuesPage view={view([NAME])} />);
    const status = screen.getByRole("status");
    expect(status).toBeEmptyDOMElement();
    const box = screen.getByRole("textbox", { name: /Business name/ });
    await user.clear(box);
    await user.type(box, "New Co");
    const save = screen.getByRole("button", { name: "Save Business name" });
    save.focus();
    await user.keyboard("{Enter}");
    expect(await screen.findByText("Saved.")).toBe(status);
    expect(save).not.toBeDisabled();
    expect(save).toHaveAttribute("aria-disabled", "true");
    expect(document.activeElement).toBe(save);
  });

  it("keeps keyboard focus on Lock while it works", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ key: "business_name", locked: true })));
    const user = userEvent.setup();
    render(<AdminValuesPage view={view([NAME])} />);
    const lock = screen.getByRole("button", { name: "Lock Business name" });
    lock.focus();
    await user.keyboard("{Enter}");
    expect(await screen.findByRole("button", { name: "Unlock Business name" })).toBe(lock);
    expect(document.activeElement).toBe(lock);
  });

  it("does not overflow a narrow screen", () => {
    render(<AdminValuesPage view={view([NAME])} />);
    const box = screen.getByRole("textbox", { name: /Business name/ });
    expect(box.style.width).toBe("100%");
    expect(box.style.boxSizing).toBe("border-box");
    expect(screen.getByText("business_name").style.overflowWrap).toBe("anywhere");
  });

  it("does not point a label at a missing control when the value is too long", () => {
    const { container } = render(<AdminValuesPage view={view([{ ...NAME, value: null, editable: false }])} />);
    expect(container.querySelector("label")).toBeNull();
    expect(screen.getByText("Too long to edit here. Change it in HighLevel.")).toBeInTheDocument();
  });

  it("says a value cannot be empty when an emptied box is refused", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ results: [{ key: "business_name", status: "invalid" }] })));
    const user = userEvent.setup();
    render(<AdminValuesPage view={view([NAME])} />);
    await user.clear(screen.getByRole("textbox", { name: /Business name/ }));
    await user.click(screen.getByRole("button", { name: "Save Business name" }));
    expect(await screen.findByText("Not saved. This value cannot be empty.")).toBeInTheDocument();
  });

  it("does not say the owner can change a key the owner only sees read-only, and offers no Lock for it", () => {
    render(<AdminValuesPage view={view([{ ...NAME, ownerReadOnly: true }])} />);
    expect(screen.queryByText("Owner can change")).toBeNull();
    expect(screen.getByText("Owner sees it read-only")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Lock/ })).toBeNull();
  });
});
