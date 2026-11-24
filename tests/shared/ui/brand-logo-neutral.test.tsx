// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { BrandLogo } from "@/shared/ui/brand-logo";

afterEach(cleanup);

// Requirement 6: a blank account's logo tile shows a neutral mark, never an empty tile.
describe("BrandLogo without a logo or initials", () => {
  it("draws a neutral mark in the tile", () => {
    const tile = render(<BrandLogo url={null} initials="" />).container.querySelector(".fd-logo") as HTMLElement;
    expect(tile.querySelector("svg")).not.toBeNull();
  });

  it("draws no mark when there are initials", () => {
    const tile = render(<BrandLogo url={null} initials="SR" />).container.querySelector(".fd-logo") as HTMLElement;
    expect(tile.querySelector("svg")).toBeNull();
    expect(tile).toHaveTextContent("SR");
  });
});
