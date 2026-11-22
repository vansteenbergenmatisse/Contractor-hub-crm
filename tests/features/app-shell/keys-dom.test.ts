// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { createUndoRegistry, isTyping, shortcutFor } from "@/features/app-shell";

const k = (key: string, o: Partial<{ metaKey: boolean; ctrlKey: boolean; altKey: boolean; shiftKey: boolean; code: string }> = {}) =>
  ({ key, metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, ...o });

describe("undo registry", () => {
  it("the newest registration wins and removing it restores the previous one", () => {
    const r = createUndoRegistry();
    const a = () => {};
    const b = () => {};
    const offA = r.add(a);
    const offB = r.add(b);
    expect(r.top()).toBe(b);
    offB();
    expect(r.top()).toBe(a);
    offA();
    expect(r.top()).toBeNull();
  });
});

describe("shortcutFor and isTyping", () => {
  it("⇧⌘Z is not undo, arrows while typing are not row moves, ⌘N without ⌥ is not a new lead", () => {
    expect(shortcutFor(k("z", { metaKey: true, shiftKey: true }), false)).toBeNull();
    expect(shortcutFor(k("z", { metaKey: true }), false)).toBe("undo");
    expect(shortcutFor(k("ArrowDown"), true)).toBeNull();
    expect(shortcutFor(k("ArrowDown"), false)).toBe("rowDown");
    expect(shortcutFor(k("n", { metaKey: true, code: "KeyN" }), false)).toBeNull();
    expect(shortcutFor(k("n", { metaKey: true, altKey: true, code: "KeyN" }), false)).toBe("newLead");
  });

  it("an editable element counts as typing", () => {
    const div = document.createElement("div");
    div.contentEditable = "true";
    document.body.append(div);
    expect(isTyping(div)).toBe(true);
    expect(isTyping(document.createElement("button"))).toBe(false);
    div.remove();
  });
});
