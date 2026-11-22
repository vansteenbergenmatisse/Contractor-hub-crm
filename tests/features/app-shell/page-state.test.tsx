// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { useEffect, useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PageStateProvider, useKeptReducer } from "@/features/app-shell";

const add = (n: number, by: number) => n + by;

function Counter({ k = "count" }: { k?: string }) {
  const [n, dispatch] = useKeptReducer(k, add, 0, (x) => x);
  return (
    <button type="button" onClick={() => dispatch(1)}>
      {k} {n}
    </button>
  );
}

function Pages() {
  const [shown, setShown] = useState(true);
  return (
    <PageStateProvider>
      <button type="button" onClick={() => setShown((s) => !s)}>
        toggle
      </button>
      {shown ? <Counter /> : <p>other page</p>}
      <Counter k="other" />
    </PageStateProvider>
  );
}

describe("useKeptReducer", () => {
  it("keeps a page's state when the page unmounts and mounts again inside the shell", async () => {
    const user = userEvent.setup();
    render(<Pages />);
    await user.click(screen.getByRole("button", { name: "count 0" }));
    await user.click(screen.getByRole("button", { name: "count 1" }));
    await user.click(screen.getByRole("button", { name: "toggle" }));
    expect(screen.getByText("other page")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "toggle" }));
    expect(screen.getByRole("button", { name: "count 2" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "other 0" })).toBeInTheDocument();
  });

  it("starts fresh without the shell (a page rendered alone)", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<Counter />);
    await user.click(screen.getByRole("button", { name: "count 0" }));
    unmount();
    render(<Counter />);
    expect(screen.getByRole("button", { name: "count 0" })).toBeInTheDocument();
  });
});

describe("useKeptReducer: an action after the page is gone", () => {
  it("still lands in the kept state, and the page shows it when it comes back", async () => {
    const user = userEvent.setup();
    const late: { send?: (by: number) => void } = {};
    function Page() {
      const [n, dispatch] = useKeptReducer("late", add, 0, (x) => x);
      useEffect(() => {
        late.send = dispatch;
      });
      return <p>late {n}</p>;
    }
    function Frame() {
      const [shown, setShown] = useState(true);
      return (
        <PageStateProvider>
          <button type="button" onClick={() => setShown((s) => !s)}>
            toggle
          </button>
          {shown ? <Page /> : <p>other page</p>}
        </PageStateProvider>
      );
    }
    render(<Frame />);
    expect(screen.getByText("late 0")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "toggle" }));
    expect(screen.getByText("other page")).toBeInTheDocument();
    late.send!(5); // a send timer finishing while the owner is on another page
    await user.click(screen.getByRole("button", { name: "toggle" }));
    expect(screen.getByText("late 5")).toBeInTheDocument();
  });
});
