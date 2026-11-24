// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PageStateProvider } from "@/features/app-shell";
import { NewLeadDialog } from "@/features/leads";
import { NEW_LEAD_EVENT, requestNewLead } from "@/shared/lib/new-lead-event";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

const mount = () => render(<PageStateProvider><div className="fd-app"><NewLeadDialog /></div></PageStateProvider>);
const open = async () => {
  expect(requestNewLead()).toBe(true);
  return screen.findByRole("dialog", { name: "New lead" });
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("the New lead dialog", () => {
  it("reports that nothing took the event when no form is mounted", () => {
    expect(requestNewLead()).toBe(false);
    expect(NEW_LEAD_EVENT).toBe("crm:new-lead");
  });

  it("opens with the source first and the cursor in Name", async () => {
    mount();
    const dialog = await open();
    const fields = dialog.querySelectorAll("select, input");
    expect(fields[0]).toBe(within(dialog).getByLabelText("Where the lead came from"));
    await waitFor(() => expect(within(dialog).getByLabelText("Name")).toHaveFocus());
    expect(within(dialog).queryByRole("option", { name: "Unknown" })).toBeNull();
  });

  it("while off it says not saved and calls no server", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    mount();
    const dialog = await open();
    expect(dialog).toHaveTextContent("It stays on your Leads screen and is not saved.");
    await user.type(within(dialog).getByLabelText("Name"), "Pat");
    await user.type(within(dialog).getByLabelText("Phone"), "6145550100");
    await user.click(within(dialog).getByRole("button", { name: "Add lead" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps the dialog open on a wrong field", async () => {
    const user = userEvent.setup();
    mount();
    const dialog = await open();
    await user.click(within(dialog).getByRole("button", { name: "Add lead" }));
    expect(within(dialog).getByText("Enter a name.")).toBeInTheDocument();
    await waitFor(() => expect(within(dialog).getByLabelText("Name")).toHaveFocus());
  });

  it("Escape closes it", async () => {
    const user = userEvent.setup();
    mount();
    await open();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
});
