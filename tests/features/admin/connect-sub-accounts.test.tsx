// @vitest-environment happy-dom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ClientsTable } from "../../../src/features/admin/components/ClientsTable";

describe("ClientsTable: Connect sub-accounts", () => {
  it("is a plain link to the install route, styled with the existing button class", () => {
    render(<ClientsTable clients={[]} />);
    const link = screen.getByRole("link", { name: "Connect sub-accounts" });
    // A plain anchor: the route redirects off-site, so this must be a full page load.
    expect(link.tagName).toBe("A");
    expect(link).toHaveAttribute("href", "/api/integrations/oauth/start");
    expect(link).toHaveClass("fd-btn");
    expect(link).not.toHaveAttribute("target");
  });

  it("explains the production choice in one line", () => {
    render(<ClientsTable clients={[]} />);
    expect(screen.getByText("In production, select all sub-accounts so new clients connect automatically.")).toBeInTheDocument();
  });
});
