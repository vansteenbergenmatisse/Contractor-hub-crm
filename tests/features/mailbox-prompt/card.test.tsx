// @vitest-environment happy-dom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MailboxPromptCard } from "@/features/mailbox-prompt";

const fetchMock = vi.fn();
let n = 0;
const token = () => `token-${(n += 1)}`;

function inMain(ui: React.ReactNode) {
  return render(<main id="fd-main" tabIndex={-1}>{ui}</main>);
}

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(new Response("{}", { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe("MailboxPromptCard", () => {
  it("shows the question and the request to check, using the design's card", () => {
    inMain(<MailboxPromptCard token={token()} />);
    const card = screen.getByRole("region", { name: "Using email from the CRM?" });
    expect(card).toHaveClass("fd-card");
    expect(card).toHaveTextContent("Check that your mailbox is connected in HighLevel.");
    expect(card.querySelector("a")).toBeNull();
  });

  it("dismisses with the keyboard, moves focus to the page and posts with no body", async () => {
    const user = userEvent.setup();
    inMain(<MailboxPromptCard token={token()} />);
    await user.tab();
    expect(screen.getByRole("button", { name: /dismiss/i })).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(screen.queryByRole("region")).toBeNull();
    expect(document.getElementById("fd-main")).toHaveFocus();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/mailbox-prompt/dismiss");
    expect(init).toMatchObject({ method: "POST", credentials: "same-origin" });
    expect(init.body).toBeUndefined();
  });

  it("stays closed when the page changes and the card mounts again with the same token", async () => {
    const user = userEvent.setup();
    const same = token();
    const first = inMain(<MailboxPromptCard token={same} />);
    await user.click(screen.getByRole("button", { name: /dismiss/i }));
    first.unmount();
    inMain(<MailboxPromptCard token={same} />);
    expect(screen.queryByRole("region")).toBeNull();
  });

  it("closes for this view when saving fails, with no thrown error, and can come back on a new render", async () => {
    fetchMock.mockRejectedValue(new Error("offline"));
    const user = userEvent.setup();
    const first = inMain(<MailboxPromptCard token={token()} />);
    await user.click(screen.getByRole("button", { name: /dismiss/i }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(screen.queryByRole("region")).toBeNull();
    first.unmount();
    inMain(<MailboxPromptCard token={token()} />);
    expect(screen.getByRole("region")).toBeInTheDocument();
  });
});
