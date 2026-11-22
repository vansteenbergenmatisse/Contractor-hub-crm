// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";

const push = vi.fn();
let search = new URLSearchParams();
vi.mock("next/navigation", () => ({
  usePathname: () => "/pipeline",
  useRouter: () => ({ push, refresh: vi.fn() }),
  useSearchParams: () => search,
}));

import { AppShell, buildBusiness, useRowFocus, useShell, useUndoShortcut, type SearchRow, type SendTimerRequest } from "@/features/app-shell";

const business = buildBusiness({ name: "Sample Roofing", owner: "Pat Lee" });
const rows: SearchRow[] = [{ id: "quote-q1", page: "quotes", name: "Maria Alvarez", sub: "Roof", href: "/quotes" }];

const doc = { title: "Quote", name: "Maria Alvarez", sub: "Roof", amount: "$100", lines: [["Shingles", "$100"]] as const };

function SendPage({ onDone }: { onDone: () => void }) {
  const { sendTimer, askReason } = useShell();
  const request: SendTimerRequest = { kind: "Quote", name: "Maria Alvarez", total: "$100", doc, onDone };
  return (
    <div>
      <button type="button" onClick={() => sendTimer(request)}>Send quote</button>
      <button type="button" onClick={() => askReason({ name: "Maria", onPick: onDone })}>Remove</button>
    </div>
  );
}

const shell = (page: React.ReactNode) => render(<AppShell business={business} searchRows={rows}>{page}</AppShell>);
const dialogNamed = (name: RegExp) => screen.queryByRole("alertdialog", { name });

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
  push.mockClear();
  search = new URLSearchParams();
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => {
  vi.useRealTimers();
});

const setupUser = () => userEvent.setup({ delay: null });
const wait = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });

describe("send timer dialog", () => {
  it("Escape cancels, Tab stays inside, and focus goes back to the button that opened it", async () => {
    const user = setupUser();
    const onDone = vi.fn();
    shell(<SendPage onDone={onDone} />);
    const opener = screen.getByRole("button", { name: "Send quote" });
    await user.click(opener);
    await wait(100);
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: "View quote" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();
    await user.tab({ shift: true });
    expect(screen.getByRole("button", { name: "View quote" })).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(dialogNamed(/Sending to/)).toBeNull();
    expect(opener).toHaveFocus();
    await wait(25_000);
    expect(onDone).not.toHaveBeenCalled();
  });

  it("Escape goes back from the shown quote first, then cancels", async () => {
    const user = setupUser();
    const onDone = vi.fn();
    shell(<SendPage onDone={onDone} />);
    await user.click(screen.getByRole("button", { name: "Send quote" }));
    await user.click(screen.getByRole("button", { name: "View quote" }));
    const dialog = dialogNamed(/Sending to/);
    expect(dialog).toHaveClass("is-view");
    await user.keyboard("{Escape}");
    expect(dialog).not.toHaveClass("is-view");
    expect(dialogNamed(/Sending to/)).not.toBeNull();
    await wait(100);
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(dialogNamed(/Sending to/)).toBeNull();
    expect(onDone).not.toHaveBeenCalled();
  });

  it("when the count runs out the send runs once and focus goes back to the opener", async () => {
    const user = setupUser();
    const onDone = vi.fn();
    shell(<SendPage onDone={onDone} />);
    const opener = screen.getByRole("button", { name: "Send quote" });
    await user.click(opener);
    await wait(20_000);
    expect(onDone).not.toHaveBeenCalled();
    await wait(300);
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(dialogNamed(/Sending to/)).toBeNull();
    expect(opener).toHaveFocus();
  });
});

describe("reason sheet", () => {
  it("Escape is Cancel, Tab wraps inside, focus returns to the opener", async () => {
    const user = setupUser();
    const onPick = vi.fn();
    shell(<SendPage onDone={onPick} />);
    const opener = screen.getByRole("button", { name: "Remove" });
    await user.click(opener);
    await wait(100);
    expect(screen.getByRole("button", { name: "Ask again later" })).toHaveFocus();
    await user.tab({ shift: true });
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: "Ask again later" })).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(dialogNamed(/off the board/)).toBeNull();
    expect(onPick).not.toHaveBeenCalled();
    expect(opener).toHaveFocus();
  });

  it("a pick answers and gives focus back", async () => {
    const user = setupUser();
    const onPick = vi.fn();
    shell(<SendPage onDone={onPick} />);
    const opener = screen.getByRole("button", { name: "Remove" });
    await user.click(opener);
    await user.click(screen.getByRole("button", { name: "Said no" }));
    expect(onPick).toHaveBeenCalledWith("Said no");
    expect(opener).toHaveFocus();
  });
});

describe("search", () => {
  it("keeps recent searches after search closes and opens again", async () => {
    const user = setupUser();
    shell(<p>page</p>);
    await user.keyboard("{Meta>}f{/Meta}");
    await user.keyboard("mar");
    await user.keyboard("{Enter}");
    expect(push).toHaveBeenCalledWith("/quotes?row=quote-q1");
    expect(screen.queryByRole("combobox")).toBeNull();
    await user.keyboard("{Meta>}f{/Meta}");
    expect(screen.getByText("Recent searches")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "mar" })).toBeInTheDocument();
  });
});

function UndoPage({ registered }: { registered?: () => void }) {
  const [undone, setUndone] = useState(false);
  useUndoShortcut(registered ?? null);
  return (
    <div>
      <input aria-label="note" />
      <p>{undone ? "undone" : "changed"}</p>
      <button type="button" onClick={() => setUndone(true)}>Undo</button>
    </div>
  );
}

describe("keyboard shortcuts", () => {
  it("⌘, opens Settings and ⌘⌥N adds a lead", async () => {
    const user = setupUser();
    shell(<p>page</p>);
    await user.keyboard("{Meta>},{/Meta}");
    expect(push).toHaveBeenLastCalledWith("/settings");
    await user.keyboard("{Control>}{Alt>}n{/Alt}{/Control}");
    expect(push).toHaveBeenLastCalledWith("/leads?add=1");
  });

  it("⌘? shows the shortcut list; Escape closes it and focus goes back", async () => {
    const user = setupUser();
    shell(<button type="button">here</button>);
    const here = screen.getByRole("button", { name: "here" });
    here.focus();
    await user.keyboard("{Meta>}/{/Meta}");
    const help = screen.getByRole("dialog", { name: "Keyboard shortcuts" });
    expect(help).toHaveTextContent("Undo the last change on this page");
    expect(screen.getByRole("button", { name: "Done" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: "Done" })).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Keyboard shortcuts" })).toBeNull();
    expect(here).toHaveFocus();
  });

  it("⌘Z presses the Undo on screen, but not while typing", async () => {
    const user = setupUser();
    shell(<UndoPage />);
    await user.click(screen.getByRole("textbox", { name: "note" }));
    await user.keyboard("{Meta>}z{/Meta}");
    expect(screen.getByText("changed")).toBeInTheDocument();
    screen.getByRole("button", { name: "Undo" }).focus();
    await user.keyboard("{Meta>}z{/Meta}");
    expect(screen.getByText("undone")).toBeInTheDocument();
    expect(screen.getByText("Undone.")).toBeInTheDocument();
  });

  it("⌘Z runs a registered undo instead", async () => {
    const user = setupUser();
    const registered = vi.fn();
    shell(<UndoPage registered={registered} />);
    document.body.focus();
    await user.keyboard("{Meta>}z{/Meta}");
    expect(registered).toHaveBeenCalledTimes(1);
    expect(screen.getByText("changed")).toBeInTheDocument();
  });

  it("Arrow Down and Up move between rows", async () => {
    const user = setupUser();
    shell(
      <div className="fd-lst">
        <div className="fd-rw"><button type="button">Row one</button></div>
        <div className="fd-rw is-off"><button type="button">Hidden row</button></div>
        <div className="fd-rw"><button type="button">Row two</button></div>
      </div>,
    );
    screen.getByRole("button", { name: "Row one" }).focus();
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("button", { name: "Row two" })).toHaveFocus();
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("button", { name: "Row two" })).toHaveFocus();
    await user.keyboard("{ArrowUp}");
    expect(screen.getByRole("button", { name: "Row one" })).toHaveFocus();
  });
});

describe("drawer, feedback and skip link", () => {
  it("the open menu keeps Tab inside and Escape gives focus back", async () => {
    const user = setupUser();
    shell(<p>page</p>);
    const menu = screen.getByRole("button", { name: "Open menu" });
    await user.click(menu);
    await wait(100);
    const nav = screen.getByRole("navigation", { name: "Main menu" });
    expect(nav).toContainElement(document.activeElement as HTMLElement);
    await user.tab({ shift: true });
    expect(screen.getByRole("button", { name: "Sign out" })).toHaveFocus();
    await user.tab();
    expect(nav).toContainElement(document.activeElement as HTMLElement);
    await user.keyboard("{Escape}");
    expect(nav).not.toHaveClass("is-open");
    expect(menu).toHaveFocus();
  });

  it("feedback takes focus, is modal, and Send waits for a note", async () => {
    const user = setupUser();
    shell(<p>page</p>);
    await user.click(screen.getAllByRole("button", { name: "Send feedback" })[0]);
    await wait(100);
    const sheet = screen.getByRole("dialog", { name: "Send feedback" });
    expect(sheet).toHaveAttribute("aria-modal", "true");
    expect(screen.getByRole("textbox", { name: "Your feedback" })).toHaveFocus();
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
    await user.keyboard("   ");
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
    await user.keyboard("More colors");
    await user.click(screen.getByRole("button", { name: "Send" }));
    expect(screen.getByText(/Sent\. We read every note\./)).toBeInTheDocument();
  });

  it("has a skip link that moves focus to the main content", async () => {
    const user = setupUser();
    shell(<p>page</p>);
    const skip = screen.getByRole("link", { name: "Skip to main content" });
    await user.click(skip);
    expect(document.getElementById("fd-main")).toHaveFocus();
  });
});

function Rows({ ids }: { ids: string[] }) {
  useRowFocus(ids);
  return <ul>{ids.map((id) => <li key={id} data-row-id={id} tabIndex={-1}>{id}</li>)}</ul>;
}

describe("useRowFocus", () => {
  it("focuses and flashes the ?row= row, and again when ?row= changes on an open page", () => {
    const ids = ["a", "b", "c"];
    search = new URLSearchParams("row=b");
    const view = render(<Rows ids={ids} />);
    expect(screen.getByText("b")).toHaveFocus();
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({ block: "center" });
    act(() => { vi.advanceTimersByTime(150); });
    expect(document.querySelector(".fx-flash")).not.toBeNull();
    act(() => { vi.advanceTimersByTime(1500); });
    expect(document.querySelector(".fx-flash")).toBeNull();
    search = new URLSearchParams("row=c");
    view.rerender(<Rows ids={ids} />);
    expect(screen.getByText("c")).toHaveFocus();
  });

  it("flashes again when the same search result is picked twice on an open page", async () => {
    const user = setupUser();
    search = new URLSearchParams("row=quote-q1");
    shell(<Rows ids={["quote-q1"]} />);
    await wait(2000);
    expect(document.querySelector(".fx-flash")).toBeNull();
    await user.keyboard("{Meta>}f{/Meta}");
    await user.keyboard("mar{Enter}");
    expect(push).toHaveBeenLastCalledWith("/quotes?row=quote-q1");
    await wait(150);
    expect(document.querySelector(".fx-flash")).not.toBeNull();
    expect(screen.getByText("quote-q1")).toHaveFocus();
  });

  it("ignores an id that is not one of the page's rows", () => {
    search = new URLSearchParams("row=zzz");
    render(<Rows ids={["a"]} />);
    expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
  });
});
