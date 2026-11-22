// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect, useRef, useState } from "react";

const push = vi.fn();
let search = new URLSearchParams();
vi.mock("next/navigation", () => ({
  usePathname: () => "/pipeline",
  useRouter: () => ({ push, refresh: vi.fn() }),
  useSearchParams: () => search,
}));

import { AppShell, ROW_PICK_EVENT, buildBusiness, useDialog, useRowFocus, useShell, useUndoShortcut, type SearchRow, type SendTimerRequest } from "@/features/app-shell";

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

  it("Back from the shown quote puts focus on Cancel again", async () => {
    const user = setupUser();
    shell(<SendPage onDone={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Send quote" }));
    await user.click(screen.getByRole("button", { name: "View quote" }));
    await user.click(screen.getByRole("button", { name: "Back" }));
    await wait(100);
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();
  });

  it("a dialog removed in the last 300 ms before sending sends nothing", async () => {
    const user = setupUser();
    const onDone = vi.fn();
    const view = shell(<SendPage onDone={onDone} />);
    await user.click(screen.getByRole("button", { name: "Send quote" }));
    await wait(20_000);
    view.unmount();
    await wait(400);
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

describe("reason sheet answers", () => {
  it("\"Ask again later\" answers later", async () => {
    const user = setupUser();
    const onPick = vi.fn();
    shell(<SendPage onDone={onPick} />);
    await user.click(screen.getByRole("button", { name: "Remove" }));
    await user.click(screen.getByRole("button", { name: "Ask again later" }));
    expect(onPick).toHaveBeenCalledWith("later");
  });
});

describe("useDialog", () => {
  it("an open sheet takes Escape before the page's own handler", async () => {
    const user = setupUser();
    const pageEscape = vi.fn();
    function EscPage() {
      useEffect(() => {
        const on = (e: KeyboardEvent) => { if (e.key === "Escape") pageEscape(); };
        document.addEventListener("keydown", on);
        window.addEventListener("keydown", on);
        return () => {
          document.removeEventListener("keydown", on);
          window.removeEventListener("keydown", on);
        };
      }, []);
      return <SendPage onDone={vi.fn()} />;
    }
    shell(<EscPage />);
    await user.click(screen.getByRole("button", { name: "Remove" }));
    await wait(100);
    await user.keyboard("{Escape}");
    expect(dialogNamed(/off the board/)).toBeNull();
    expect(pageEscape).not.toHaveBeenCalled();
  });

  it("a closed sheet no longer reacts to Escape", async () => {
    const user = setupUser();
    const onEscape = vi.fn();
    function Box({ open }: { open: boolean }) {
      const ref = useRef<HTMLDivElement>(null);
      useDialog(ref, onEscape, open);
      return <div ref={ref}><button type="button">in</button></div>;
    }
    const view = render(<Box open />);
    await user.keyboard("{Escape}");
    expect(onEscape).toHaveBeenCalledTimes(1);
    view.rerender(<Box open={false} />);
    await user.keyboard("{Escape}");
    expect(onEscape).toHaveBeenCalledTimes(1);
  });

  it("a pick that moves focus keeps it there", async () => {
    const user = setupUser();
    function MovePage() {
      const { askReason } = useShell();
      return (
        <div>
          <button type="button" onClick={() => askReason({ name: "Maria", onPick: () => document.getElementById("target")?.focus() })}>Remove</button>
          <button type="button" id="target">Target</button>
        </div>
      );
    }
    shell(<MovePage />);
    await user.click(screen.getByRole("button", { name: "Remove" }));
    await user.click(screen.getByRole("button", { name: "Said no" }));
    expect(screen.getByRole("button", { name: "Target" })).toHaveFocus();
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

  it("⌘Z skips a disabled Undo", async () => {
    const user = setupUser();
    const click = vi.fn();
    shell(<button type="button" disabled onClick={click}>Undo</button>);
    document.body.focus();
    await user.keyboard("{Meta>}z{/Meta}");
    expect(click).not.toHaveBeenCalled();
    expect(screen.queryByText("Undone.")).toBeNull();
  });

  it("arrows do not move rows inside Settings, and skip no-action buttons", async () => {
    const user = setupUser();
    shell(
      <>
        <div className="fd-stsec"><div className="fd-lst">
          <div className="fd-rw"><button type="button">S1</button></div><div className="fd-rw"><button type="button">S2</button></div>
        </div></div>
        <div className="fd-lst">
          <div className="fd-rw"><button type="button">R1</button></div>
          <div className="fd-rw"><button type="button" data-fx-noact="">Noact</button><button type="button">R2</button></div>
        </div>
      </>,
    );
    screen.getByRole("button", { name: "S1" }).focus();
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("button", { name: "S1" })).toHaveFocus();
    screen.getByRole("button", { name: "R1" }).focus();
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("button", { name: "R2" })).toHaveFocus();
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
    await wait(10);
    expect(screen.getByRole("button", { name: "Close" })).toHaveFocus();
    await user.click(screen.getByRole("button", { name: "Close" }));
    await user.click(screen.getAllByRole("button", { name: "Send feedback" })[0]);
    await wait(100);
    expect(screen.getByRole("textbox", { name: "Your feedback" }).closest(".fd-part")).not.toHaveClass("is-off");
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

  it("does not take focus again when the page's rows change", () => {
    search = new URLSearchParams("row=b");
    const view = render(<><button type="button">elsewhere</button><Rows ids={["a", "b"]} /></>);
    screen.getByRole("button", { name: "elsewhere" }).focus();
    view.rerender(<><button type="button">elsewhere</button><Rows ids={["a", "b", "c"]} /></>);
    expect(screen.getByRole("button", { name: "elsewhere" })).toHaveFocus();
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledTimes(1);
  });

  it("a pick of another row does not flash the current one", () => {
    search = new URLSearchParams("row=a");
    render(<Rows ids={["a", "b"]} />);
    act(() => { vi.advanceTimersByTime(2000); });
    act(() => { window.dispatchEvent(new CustomEvent(ROW_PICK_EVENT, { detail: "b" })); });
    act(() => { vi.advanceTimersByTime(150); });
    expect(document.querySelector(".fx-flash")).toBeNull();
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledTimes(1);
  });

  it("leaves no ring or layer behind when the page closes before the flash", () => {
    search = new URLSearchParams("row=a");
    const view = render(<Rows ids={["a"]} />);
    act(() => { vi.advanceTimersByTime(50); });
    view.unmount();
    act(() => { vi.advanceTimersByTime(200); });
    expect(document.querySelector(".fx-flash")).toBeNull();
    expect(document.getElementById("fx")).toBeNull();
  });

  it("handles the same ?row= again after it was cleared", () => {
    search = new URLSearchParams("row=a");
    const view = render(<Rows ids={["a"]} />);
    search = new URLSearchParams("");
    view.rerender(<Rows ids={["a"]} />);
    search = new URLSearchParams("row=a");
    view.rerender(<Rows ids={["a"]} />);
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledTimes(2);
  });

  it("ignores an id that is not one of the page's rows", () => {
    search = new URLSearchParams("row=zzz");
    render(<Rows ids={["a"]} />);
    expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
  });
});
