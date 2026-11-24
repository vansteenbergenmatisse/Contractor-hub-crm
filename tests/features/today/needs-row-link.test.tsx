// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => null,
}));

import { TodayNeedsCard } from "@/features/today";

const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");

afterEach(cleanup);

describe("Needs you row link", () => {
  it("makes the link the whole row", () => {
    const { container } = render(<TodayNeedsCard leads={{ state: "empty" } as never} toSend={2} timeZone="UTC" />);
    const link = container.querySelector("li.fd-row > a.fd-nl");
    expect(link?.getAttribute("href")).toBeTruthy();
    expect(link?.textContent).toBe("2 invoices to send");
  });

  it("gives the link a 44px minimum and a visible focus style", () => {
    const rule = /\.fd-nl\{([^}]*)\}/.exec(css)?.[1] ?? "";
    expect(Number(/min-height:(\d+)px/.exec(rule)?.[1])).toBeGreaterThanOrEqual(44);
    expect(rule).toMatch(/display:flex/);
    expect(css).toMatch(/\.fd-nl:focus-visible\{outline:3px solid var\(--main-color\)/);
  });
});
