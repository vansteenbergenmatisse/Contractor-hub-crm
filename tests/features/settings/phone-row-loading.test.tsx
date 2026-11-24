// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { PhoneRow } from "../../../src/features/settings/components/PhoneRow";
import type { PhoneNumbersView } from "@/features/settings";

// Made-up number only.
const OK: PhoneNumbersView = { state: "ok", numbers: [{ number: "+15550100000", name: null }], complete: true };

afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("the phone row while the read is running", () => {
  it("says it is checking, and never claims a result", () => {
    render(<ul><PhoneRow phone={new Promise(() => {})} /></ul>);
    expect(screen.getByRole("status").textContent).toBe("Checking your phone numbers…");
    expect(screen.queryByText("Not available yet")).toBeNull();
  });

  it("shows the numbers once the read finishes", async () => {
    render(<ul><PhoneRow phone={Promise.resolve(OK)} /></ul>);
    expect(await screen.findByText("+15550100000")).toBeTruthy();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("says the numbers could not be loaded when the read fails", async () => {
    render(<ul><PhoneRow phone={Promise.reject(new Error("down"))} /></ul>);
    expect(await screen.findByText(/could not be loaded/)).toBeTruthy();
  });

  it("stops saying it is checking when the read never finishes", async () => {
    vi.useFakeTimers();
    render(<ul><PhoneRow phone={new Promise(() => {})} /></ul>);
    await act(async () => { await vi.advanceTimersByTimeAsync(20_000); });
    expect(screen.getByText(/could not be loaded/)).toBeTruthy();
  });

  it("keeps the shown numbers while a refreshed read is running", async () => {
    const { rerender } = render(<ul><PhoneRow phone={Promise.resolve(OK)} /></ul>);
    await screen.findByText("+15550100000");
    rerender(<ul><PhoneRow phone={new Promise(() => {})} /></ul>);
    expect(screen.getByText("+15550100000")).toBeTruthy();
  });
});
