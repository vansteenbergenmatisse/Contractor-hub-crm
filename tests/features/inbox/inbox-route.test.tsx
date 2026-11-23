import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getRequestUser, createTenantInboxReader, loadInbox, hitRateLimit } = vi.hoisted(() => ({
  getRequestUser: vi.fn(),
  createTenantInboxReader: vi.fn(() => "reader"),
  loadInbox: vi.fn(async () => ({ state: "empty" })),
  hitRateLimit: vi.fn(),
}));
vi.mock("../../../src/app/session", () => ({ getRequestUser }));
vi.mock("@/features/auth", () => ({ hitRateLimit }));
vi.mock("@/features/highlevel", () => ({ createTenantInboxReader }));
vi.mock("@/features/inbox", () => ({ InboxLivePage: () => null, InboxSkeleton: () => null, loadInbox }));

import Page from "../../../src/app/(app)/inbox/page";

// Runs the page's async data component.
async function run(row?: string | string[]) {
  const suspense = Page({ searchParams: Promise.resolve({ row }) }) as ReactElement<{ children: ReactElement<{ searchParams: Promise<Record<string, string>> }> }>;
  const data = suspense.props.children;
  await (data.type as (props: unknown) => Promise<unknown>)(data.props);
}

beforeEach(() => vi.clearAllMocks());

describe("the inbox route", () => {
  it("reads the session tenant with the normal reader", async () => {
    getRequestUser.mockResolvedValue({ id: "u1", tenantId: "t1" });
    await run("inbox-a");
    expect(createTenantInboxReader).toHaveBeenCalledWith(hitRateLimit);
    expect(loadInbox).toHaveBeenCalledWith("t1", "reader", "inbox-a");
  });

  it("gives an admin's client view the viewer reader", async () => {
    getRequestUser.mockResolvedValue({ id: "admin-1", tenantId: "t1", viewing: true });
    await run();
    expect(createTenantInboxReader).toHaveBeenCalledWith(hitRateLimit, { viewerId: "admin-1" });
    expect(loadInbox).toHaveBeenCalledWith("t1", "reader", null);
  });

  it("ignores a repeated row parameter", async () => {
    getRequestUser.mockResolvedValue({ id: "u1", tenantId: "t1" });
    await run(["inbox-a", "inbox-b"]);
    expect(loadInbox).toHaveBeenCalledWith("t1", "reader", null);
  });
});
