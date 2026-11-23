import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const emptyList = { ok: true, rows: [], total: 0, complete: true, dropped: 0 };
  const emptyWorkflows = { ok: true, workflows: [], complete: true, dropped: 0 };
  const readQuotes = vi.fn<(tenantId: string) => Promise<typeof emptyList>>(async () => emptyList);
  const readWorkflows = vi.fn<(tenantId: string) => Promise<typeof emptyWorkflows>>(async () => emptyWorkflows);
  const readInvoices = vi.fn<(tenantId: string, signal?: AbortSignal) => Promise<typeof emptyList>>(async () => emptyList);
  const readTransactions = vi.fn<(tenantId: string, signal?: AbortSignal) => Promise<typeof emptyList>>(async () => emptyList);
  return {
    getRequestUser: vi.fn(),
    hitRateLimit: vi.fn(),
    readQuotes,
    readWorkflows,
    readInvoices,
    readTransactions,
    createTenantEstimatesReader: vi.fn<(...args: unknown[]) => typeof readQuotes>(() => readQuotes),
    createTenantWorkflowsReader: vi.fn<(...args: unknown[]) => typeof readWorkflows>(() => readWorkflows),
    createTenantBillingReaders: vi.fn<(...args: unknown[]) => { invoices: typeof readInvoices; transactions: typeof readTransactions }>(() => ({ invoices: readInvoices, transactions: readTransactions })),
  };
});

vi.mock("../../src/app/session", () => ({ getRequestUser: mocks.getRequestUser }));
vi.mock("@/features/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/auth")>()),
  hitRateLimit: mocks.hitRateLimit,
}));
vi.mock("@/features/highlevel", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/highlevel")>()),
  createTenantEstimatesReader: mocks.createTenantEstimatesReader,
  createTenantWorkflowsReader: mocks.createTenantWorkflowsReader,
  createTenantBillingReaders: mocks.createTenantBillingReaders,
}));

import * as automationsRoute from "../../src/app/(app)/automations/page";
import * as invoicesRoute from "../../src/app/(app)/invoices/page";
import * as paymentsRoute from "../../src/app/(app)/payments/page";
import * as quotesRoute from "../../src/app/(app)/quotes/page";
import { NotAvailablePage } from "../../src/shared/ui/not-available-page";

type Route = { default: () => ReactElement; dynamic?: string; maxDuration?: number };
type Case = {
  name: string;
  flag: string;
  title: string;
  route: Route;
  factory: typeof mocks.createTenantEstimatesReader;
  readers: () => ReturnType<typeof vi.fn>[];
};

const CASES: Case[] = [
  { name: "quotes", flag: "QUOTES_PAGE_LIVE", title: "Quotes", route: quotesRoute, factory: mocks.createTenantEstimatesReader, readers: () => [mocks.readQuotes] },
  { name: "invoices", flag: "INVOICES_PAGE_LIVE", title: "Invoices", route: invoicesRoute, factory: mocks.createTenantBillingReaders as never, readers: () => [mocks.readInvoices] },
  { name: "payments", flag: "PAYMENTS_PAGE_LIVE", title: "Payments due", route: paymentsRoute, factory: mocks.createTenantBillingReaders as never, readers: () => [mocks.readInvoices, mocks.readTransactions] },
  { name: "automations", flag: "AUTOMATIONS_PAGE_LIVE", title: "Automations", route: automationsRoute, factory: mocks.createTenantWorkflowsReader as never, readers: () => [mocks.readWorkflows] },
];

const KILL_SWITCHES = ["QUOTES_READ_DISABLED", "INVOICES_READ_DISABLED", "PAYMENTS_READ_DISABLED", "AUTOMATIONS_READ_DISABLED"];
const OFF_VALUES: readonly [string, string | undefined][] = [
  ["unset", undefined],
  ["empty", ""],
  ["false", "false"],
  ["uppercase", "TRUE"],
  ["capitalized", "True"],
  ["leading space", " true"],
  ["trailing space", "true "],
  ["one", "1"],
  ["yes", "yes"],
];

// Runs the Suspense child the page returned, which is where the session and reader are used.
async function renderData(page: ReactElement) {
  const child = (page.props as { children: ReactElement<Record<string, unknown>> }).children;
  const Data = child.type as (props: Record<string, unknown>) => Promise<ReactElement<{ result: { state: string } }>>;
  return Data(child.props);
}

beforeEach(() => {
  vi.clearAllMocks();
  for (const name of KILL_SWITCHES) vi.stubEnv(name, "");
  for (const { flag } of CASES) {
    vi.stubEnv(flag, "");
    vi.stubEnv(`NEXT_PUBLIC_${flag}`, "");
  }
});

afterEach(() => vi.unstubAllEnvs());

describe.each(CASES)("the $name page flag", ({ flag, title, route, factory, readers }) => {
  const Page = route.default;

  it("is resolved at request time and outlives the 25s read deadline", () => {
    expect(route.dynamic).toBe("force-dynamic");
    expect(route.maxDuration).toBeGreaterThan(25);
  });

  it.each(OFF_VALUES)("stays unavailable and reads nothing when the flag is %s", (_label, value) => {
    vi.stubEnv(flag, value as string);
    const html = renderToStaticMarkup(Page());
    expect(html).toBe(renderToStaticMarkup(<NotAvailablePage title={title} />));
    expect(mocks.getRequestUser).not.toHaveBeenCalled();
    expect(factory).not.toHaveBeenCalled();
    for (const read of readers()) expect(read).not.toHaveBeenCalled();
  });

  it("ignores a NEXT_PUBLIC_ twin of the flag", () => {
    vi.stubEnv(`NEXT_PUBLIC_${flag}`, "true");
    expect(renderToStaticMarkup(Page())).toBe(renderToStaticMarkup(<NotAvailablePage title={title} />));
    expect(factory).not.toHaveBeenCalled();
  });

  it("reads as the session tenant with no viewer for an owner", async () => {
    vi.stubEnv(flag, "true");
    mocks.getRequestUser.mockResolvedValue({ id: "user-1", tenantId: "tenant-session", role: "owner" });
    const el = await renderData(Page());
    expect(factory.mock.calls).toEqual([[mocks.hitRateLimit]]);
    for (const read of readers()) expect(read.mock.calls[0]?.[0]).toBe("tenant-session");
    expect(el.props.result.state).toBe("empty");
  });

  it("passes { viewerId } while an admin views the client", async () => {
    vi.stubEnv(flag, "true");
    mocks.getRequestUser.mockResolvedValue({ id: "admin-1", tenantId: "tenant-viewed", role: "admin", viewing: true });
    await renderData(Page());
    expect(factory.mock.calls).toEqual([[mocks.hitRateLimit, { viewerId: "admin-1" }]]);
    for (const read of readers()) expect(read.mock.calls[0]?.[0]).toBe("tenant-viewed");
  });

  it("reads nothing without a session tenant", async () => {
    vi.stubEnv(flag, "true");
    mocks.getRequestUser.mockResolvedValue(null);
    const el = await renderData(Page());
    for (const read of readers()) expect(read).not.toHaveBeenCalled();
    expect(el.props.result.state).toBe("unavailable");
  });
});
