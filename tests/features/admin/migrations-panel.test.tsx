// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MigrationsPanel, type MigrationsView } from "@/features/admin";

// /admin/migrations rendering. Made-up migration names.
const base: MigrationsView = { environment: "preview", ref: "staging", expected: 3, applied: ["a", "b", "c"], pending: [], problems: [], notInCode: [], historyMissing: false };

afterEach(cleanup);

describe("MigrationsPanel", () => {
  it("lists pending migrations by name and does not claim none pending", () => {
    render(<MigrationsPanel view={{ ...base, applied: ["a"], pending: ["b", "c"] }} />);
    expect(screen.getByRole("status").textContent).toBe("1 of 3 applied. 2 pending.");
    const list = screen.getByRole("heading", { name: "Pending" }).nextElementSibling as HTMLElement;
    expect([...list.querySelectorAll("li")].map((li) => li.textContent)).toEqual(["b", "c"]);
    expect(screen.getByText("preview (staging)")).toBeTruthy();
  });

  it("shows a read error as an alert, never as all applied", () => {
    render(<MigrationsPanel view={{ ...base, applied: [], readError: true }} />);
    expect(screen.getByRole("alert").textContent).toContain("Could not read this environment's migrations.");
    expect(screen.queryByText(/None pending/)).toBeNull();
  });

  it("says when the history table is missing", () => {
    render(<MigrationsPanel view={{ ...base, environment: "local", ref: null, applied: [], pending: ["a", "b", "c"], historyMissing: true }} />);
    expect(screen.getByText("This database has no migration history table, so every migration is pending.")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toBe("0 of 3 applied. 3 pending.");
  });

  it("says all applied when nothing is pending", () => {
    render(<MigrationsPanel view={base} />);
    expect(screen.getByRole("status").textContent).toBe("All 3 migrations are applied. None pending.");
  });
});
