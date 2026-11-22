// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

function Counter() {
  const [n, setN] = useState(0);
  return (
    <button type="button" onClick={() => setN(n + 1)}>
      Clicked {n}
    </button>
  );
}

describe("DOM test setup", () => {
  it("renders, clicks and moves focus", async () => {
    const user = userEvent.setup();
    render(<Counter />);
    const button = screen.getByRole("button", { name: "Clicked 0" });
    await user.click(button);
    expect(button).toHaveTextContent("Clicked 1");
    expect(button).toHaveFocus();
  });
});
