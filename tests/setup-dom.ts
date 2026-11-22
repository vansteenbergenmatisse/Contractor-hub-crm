// Shared setup for DOM tests. A test file opts into a browser-like DOM with
// the docblock `// @vitest-environment happy-dom`; every other file keeps the
// plain node environment. The jest-dom matchers (toHaveFocus, ...) are added
// everywhere (harmless in node); cleanup only runs where a DOM exists.
import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";

if (typeof document !== "undefined") {
  const { cleanup } = await import("@testing-library/react");
  afterEach(() => {
    cleanup();
  });
}
