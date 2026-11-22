import { isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  buildBusiness, createSendController, SEND_SECONDS, sendDialogHandlers, SendTimerView, startTimer, type SendTimerRequest,
} from "@/features/app-shell";

// A fake clock: `schedule` stores the waits, `flush` runs every one that is due (all of them).
function fakeSchedule() {
  const waits: Array<{ fn: () => void; ms: number; off: boolean }> = [];
  const schedule = (fn: () => void, ms: number) => {
    const w = { fn, ms, off: false };
    waits.push(w);
    return () => { w.off = true; };
  };
  const flush = () => {
    for (const w of waits.splice(0)) if (!w.off) w.fn();
  };
  return { schedule, flush, waits };
}

function setup() {
  const onDone = vi.fn();
  const onClose = vi.fn();
  const clock = fakeSchedule();
  const controller = createSendController({ onDone, onClose, schedule: clock.schedule });
  return { onDone, onClose, clock, controller };
}

const runOut = (controller: { tick: () => void }) => {
  for (let i = 0; i < SEND_SECONDS + 5; i += 1) controller.tick();
};

describe("createSendController", () => {
  it("counts down and runs onDone exactly once after reaching 0, then closes", () => {
    const { onDone, onClose, clock, controller } = setup();
    runOut(controller);
    expect(controller.state().n).toBe(0);
    expect(onDone).not.toHaveBeenCalled();
    clock.flush();
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
    // more ticks, a second fire and a stray Back do nothing
    controller.tick();
    controller.fire();
    controller.view(false);
    clock.flush();
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("runs onDone once even when the fire wait is scheduled twice", () => {
    const { onDone, clock, controller } = setup();
    runOut(controller);
    controller.view(true);
    controller.view(false);
    clock.flush();
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("does not run onDone before 0", () => {
    const { onDone, clock, controller } = setup();
    for (let i = 0; i < SEND_SECONDS - 1; i += 1) controller.tick();
    clock.flush();
    expect(controller.state().n).toBe(1);
    expect(onDone).not.toHaveBeenCalled();
  });

  it("Cancel closes and never runs onDone, even if the count would reach 0 later", () => {
    const { onDone, onClose, clock, controller } = setup();
    controller.tick();
    controller.cancel();
    expect(onClose).toHaveBeenCalledTimes(1);
    runOut(controller);
    controller.fire();
    clock.flush();
    expect(onDone).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("Cancel at 0, before the fire wait runs, still sends nothing", () => {
    const { onDone, clock, controller } = setup();
    runOut(controller);
    controller.cancel();
    clock.flush();
    expect(onDone).not.toHaveBeenCalled();
  });

  it("View pauses the count and Back goes on; it fires only after Back", () => {
    const { onDone, clock, controller } = setup();
    controller.view(true);
    controller.tick();
    expect(controller.state().n).toBe(SEND_SECONDS);
    expect(controller.state().viewing).toBe(true);
    controller.view(false);
    runOut(controller);
    controller.view(true);
    clock.flush();
    expect(onDone).not.toHaveBeenCalled();
    controller.view(false);
    clock.flush();
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("tells a listener about every change", () => {
    const onChange = vi.fn();
    const controller = createSendController({ onDone: () => {}, onClose: () => {}, schedule: fakeSchedule().schedule, onChange });
    controller.tick();
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ n: SEND_SECONDS - 1 }));
  });
});

describe("sendDialogHandlers (what the buttons call)", () => {
  it("Cancel cancels: it closes and never reaches onDone", () => {
    const { onDone, onClose, clock, controller } = setup();
    const h = sendDialogHandlers(controller);
    h.onCancel();
    runOut(controller);
    clock.flush();
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onDone).not.toHaveBeenCalled();
  });

  it("View pauses and Back resumes", () => {
    const { controller } = setup();
    const h = sendDialogHandlers(controller);
    h.onView();
    expect(controller.state().viewing).toBe(true);
    h.onBack();
    expect(controller.state().viewing).toBe(false);
  });
});

// The rendered dialog, as a React element tree (no DOM library): find a button by its text.
function textOf(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (isValidElement(node)) return textOf((node.props as { children?: ReactNode }).children);
  return "";
}
function buttons(node: ReactNode, out: ReactElement[] = []): ReactElement[] {
  if (Array.isArray(node)) {
    for (const n of node) buttons(n, out);
  } else if (isValidElement(node)) {
    if (node.type === "button") out.push(node);
    buttons((node.props as { children?: ReactNode }).children, out);
  }
  return out;
}

const business = buildBusiness({ name: "Sample Roofing", owner: "Pat Lee" });
const request = (lines: Array<[string, string]>, onDone = vi.fn()): SendTimerRequest => ({
  kind: "Quote", name: "Sam Sample", total: "$1,000",
  doc: { title: "Quote Q-1", name: "Sam Sample", sub: "1 Example Rd", amount: "$1,000", lines },
  onDone,
});

describe("SendTimerView", () => {
  it("wires Cancel to the handler that never runs onDone, and View to the pause", () => {
    const { onDone, onClose, clock, controller } = setup();
    const handlers = sendDialogHandlers(controller);
    const tree = SendTimerView({ request: request([], onDone), business, state: startTimer(), handlers });
    const all = buttons(tree);
    const cancel = all.find((b) => textOf(b) === "Cancel");
    const view = all.find((b) => textOf(b) === "View quote");
    expect(cancel).toBeDefined();
    expect(view).toBeDefined();
    (view!.props as { onClick: () => void }).onClick();
    expect(controller.state().viewing).toBe(true);
    (cancel!.props as { onClick: () => void }).onClick();
    runOut(controller);
    clock.flush();
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onDone).not.toHaveBeenCalled();
  });

  it("shows up to 3 document lines and then the Total", () => {
    const lines: Array<[string, string]> = [["Line one", "$1"], ["Line two", "$2"], ["Line three", "$3"], ["Line four", "$4"], ["Line five", "$5"]];
    const html = renderToStaticMarkup(
      <SendTimerView request={request(lines)} business={business} state={startTimer()} handlers={sendDialogHandlers(setup().controller)} />,
    );
    expect((html.match(/class="is-line"/g) ?? []).length).toBe(3);
    expect(html).toContain("Line three");
    expect(html).not.toContain("Line four");
    expect(html.indexOf("Line three")).toBeLessThan(html.indexOf(">Total<"));
  });

  it("shows two lines when the document has two", () => {
    const html = renderToStaticMarkup(
      <SendTimerView request={request([["A", "$1"], ["B", "$2"]])} business={business} state={startTimer()} handlers={sendDialogHandlers(setup().controller)} />,
    );
    expect((html.match(/class="is-line"/g) ?? []).length).toBe(2);
  });

  it("puts the business header (logo initials and name) on the document sheet", () => {
    const html = renderToStaticMarkup(
      <SendTimerView request={request([])} business={business} state={startTimer()} handlers={sendDialogHandlers(setup().controller)} />,
    );
    expect(html).toMatch(/<div class="fd-dch"><span class="fd-logo"[^>]*><span class="fd-h">SR<\/span><\/span><div><p class="fd-dcb">Sample Roofing<\/p><\/div><\/div>/);
  });

  it("has no business block when the tenant has neither a logo nor a name (no 'Your business')", () => {
    const html = renderToStaticMarkup(
      <SendTimerView request={request([])} business={buildBusiness({})} state={startTimer()} handlers={sendDialogHandlers(setup().controller)} />,
    );
    expect(html).not.toContain("fd-dch");
    expect(html).not.toContain("fd-logo");
    expect(html).not.toContain("Your business");
  });

  it("shows the count and hides the sheet until View", () => {
    const html = renderToStaticMarkup(
      <SendTimerView request={request([])} business={business} state={startTimer()} handlers={sendDialogHandlers(setup().controller)} />,
    );
    expect(html).toContain(">20</p>");
    expect(html).toContain("fd-sheet fd-dgv is-off");
    const viewing = renderToStaticMarkup(
      <SendTimerView request={request([])} business={business} state={{ ...startTimer(), viewing: true }} handlers={sendDialogHandlers(setup().controller)} />,
    );
    expect(viewing).toContain("fd-cf fd-dg is-view");
    expect(viewing).not.toContain("fd-sheet fd-dgv is-off");
  });
});
