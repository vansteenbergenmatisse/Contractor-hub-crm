import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const readQuotes = vi.fn();
  const readWorkflows = vi.fn();
  const readInvoices = vi.fn();
  const readTransactions = vi.fn();
  return {
    getRequestUser: vi.fn(),
    hitRateLimit: vi.fn(),
    readQuotes,
    readWorkflows,
    readInvoices,
    readTransactions,
    createTenantEstimatesReader: vi.fn(() => readQuotes),
    createTenantWorkflowsReader: vi.fn(() => readWorkflows),
    createTenantBillingReaders: vi.fn(() => ({ invoices: readInvoices, transactions: readTransactions })),
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

import AutomationsPage from "../../src/app/(app)/automations/page";
import InvoicesPage from "../../src/app/(app)/invoices/page";
import PaymentsPage from "../../src/app/(app)/payments/page";
import QuotesPage from "../../src/app/(app)/quotes/page";
import { AutomationsSkeleton } from "@/features/automations";
import { InvoicesSkeleton } from "@/features/invoices";
import { PaymentsSkeleton } from "@/features/payments";
import { QuotesSkeleton } from "@/features/quotes";

const CASES = [
  { name: "quotes", flag: "QUOTES_PAGE_LIVE", Page: QuotesPage, Skeleton: QuotesSkeleton },
  { name: "invoices", flag: "INVOICES_PAGE_LIVE", Page: InvoicesPage, Skeleton: InvoicesSkeleton },
  { name: "payments", flag: "PAYMENTS_PAGE_LIVE", Page: PaymentsPage, Skeleton: PaymentsSkeleton },
  { name: "automations", flag: "AUTOMATIONS_PAGE_LIVE", Page: AutomationsPage, Skeleton: AutomationsSkeleton },
];

const USERS = [
  ["an admin without a view", { id: "admin-1", tenantId: null, role: "admin" }],
  ["a user with a null tenant", { id: "user-1", tenantId: null, role: "owner" }],
] as const;

async function renderData(page: ReactElement) {
  const child = (page.props as { children: ReactElement<Record<string, unknown>> }).children;
  const Data = child.type as (props: Record<string, unknown>) => Promise<ReactElement<{ result: { state: string } }>>;
  return Data(child.props);
}

beforeEach(() => {
  vi.clearAllMocks();
  for (const name of ["QUOTES_READ_DISABLED", "INVOICES_READ_DISABLED", "PAYMENTS_READ_DISABLED", "AUTOMATIONS_READ_DISABLED"]) vi.stubEnv(name, "");
});

afterEach(() => vi.unstubAllEnvs());

describe.each(CASES)("the $name page with its flag on", ({ flag, Page, Skeleton }) => {
  it.each(USERS)("makes no reader call for %s", async (_label, user) => {
    vi.stubEnv(flag, "true");
    mocks.getRequestUser.mockResolvedValue(user);
    const el = await renderData(Page());
    expect(el.props.result.state).toBe("unavailable");
    for (const read of [mocks.readQuotes, mocks.readWorkflows, mocks.readInvoices, mocks.readTransactions]) expect(read).not.toHaveBeenCalled();
  });

  it("uses its own skeleton as the loading fallback", () => {
    vi.stubEnv(flag, "true");
    const page = Page() as ReactElement<{ fallback: ReactElement }>;
    expect(page.props.fallback.type).toBe(Skeleton);
  });
});
