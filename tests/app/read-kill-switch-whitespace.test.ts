import { afterEach, describe, expect, it, vi } from "vitest";
import { loadAutomations } from "@/features/automations";
import { loadInvoices } from "@/features/invoices";
import { loadPayments } from "@/features/payments";

afterEach(() => vi.unstubAllEnvs());

describe("read kill switches tolerate surrounding whitespace", () => {
  it('INVOICES_READ_DISABLED="true " stops the invoices read', async () => {
    vi.stubEnv("INVOICES_READ_DISABLED", "true ");
    const read = vi.fn();
    expect(await loadInvoices("t", read)).toEqual({ state: "unavailable" });
    expect(read).not.toHaveBeenCalled();
  });

  it.each(["PAYMENTS_READ_DISABLED", "INVOICES_READ_DISABLED"])('%s="true " stops the payments read', async (flag) => {
    vi.stubEnv(flag, "true ");
    const invoices = vi.fn();
    const transactions = vi.fn();
    expect(await loadPayments("t", { invoices, transactions })).toEqual({ state: "unavailable" });
    expect(invoices).not.toHaveBeenCalled();
    expect(transactions).not.toHaveBeenCalled();
  });

  it('AUTOMATIONS_READ_DISABLED="true " stops the automations read', async () => {
    vi.stubEnv("AUTOMATIONS_READ_DISABLED", "true ");
    const read = vi.fn();
    expect(await loadAutomations("t", read)).toEqual({ state: "unavailable" });
    expect(read).not.toHaveBeenCalled();
  });
});
