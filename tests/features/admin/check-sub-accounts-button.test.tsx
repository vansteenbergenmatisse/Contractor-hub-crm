// @vitest-environment happy-dom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CheckSubAccountsButton, checkResultMessage } from "../../../src/features/admin/components/CheckSubAccountsButton";
import { ClientsTable } from "../../../src/features/admin/components/ClientsTable";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("checkResultMessage", () => {
  it.each([
    [200, { connected: 0, failures: 0 }, "No new sub-accounts with the app installed."],
    [200, { connected: 1, failures: 0 }, "Connected 1 new sub-account. Reload the page to see it."],
    [200, { connected: 3, failures: 0 }, "Connected 3 new sub-accounts. Reload the page to see them."],
    [200, { connected: 1, failures: 2 }, "Connected 1 new sub-account. Reload the page to see it. 2 steps failed; the server log has the details."],
    [429, { error: "rate_limited" }, "Checked a moment ago. Wait a minute and try again."],
    [403, { error: "forbidden" }, "Could not check HighLevel. Try again."],
    [500, null, "Could not check HighLevel. Try again."],
  ] as Array<[number, Record<string, unknown> | null, string]>)("%s %j", (status, body, text) => {
    expect(checkResultMessage(status, body)).toBe(text);
  });
});

describe("CheckSubAccountsButton", () => {
  it("does nothing until clicked, then POSTs once and shows the count", async () => {
    let finish: (r: Response) => void = () => {};
    const fetchMock = vi.fn(() => new Promise<Response>((resolve) => (finish = resolve)));
    vi.stubGlobal("fetch", fetchMock);
    render(<CheckSubAccountsButton />);
    expect(fetchMock).not.toHaveBeenCalled();
    const button = screen.getByRole("button", { name: "Check for new sub-accounts" });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("/api/admin/sub-accounts/check", { method: "POST" });
    expect(screen.getByRole("button", { name: "Checking..." })).toBeDisabled();
    finish(new Response(JSON.stringify({ connected: 2, failures: 0 }), { status: 200 }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Connected 2 new sub-accounts."));
    expect(screen.getByRole("button", { name: "Check for new sub-accounts" })).toBeEnabled();
  });

  it("a network failure says so", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    render(<CheckSubAccountsButton />);
    fireEvent.click(screen.getByRole("button", { name: "Check for new sub-accounts" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Could not reach the server."));
  });

  it("is shown on the clients page", () => {
    render(<ClientsTable clients={[]} />);
    expect(screen.getByRole("button", { name: "Check for new sub-accounts" })).toBeInTheDocument();
  });
});
