import { describe, expect, it } from "vitest";
import { buildAdminValuesView } from "@/features/admin-values";

// Wave E: the admin values page lists EVERY custom value of one client, grouped by the Settings
// layout, secret-looking ones included (admin only), with each key's lock. Made-up values.
const detail = (key: string, value: string) => ({ id: `id-${key}`, key, name: key, value });

const read = {
  ok: true as const,
  values: [
    detail("business_name", "Test Co"), detail("0_webhook_url_form", "https://hooks.example.test/x"),
    detail("main_color", "#112233"), detail("seasonal_offer_text", "x".repeat(2001)), detail("brand_new_value", "y"),
    detail("business_main_x", "sk_live_madeup123456"),
  ],
  duplicates: [{ key: "business_email", value: "a@example.test" }],
};

describe("buildAdminValuesView", () => {
  const view = buildAdminValuesView({ tenantId: "T1", clientName: "Acme", read, locked: new Set(["business_name"]), writable: true });
  const rows = view.folders.flatMap((f) => f.groups.flatMap((g) => g.rows));
  const row = (key: string) => rows.find((r) => r.key === key);

  it("lists every key, secret-looking ones included", () => {
    expect(rows.map((r) => r.key).sort()).toEqual(
      ["0_webhook_url_form", "brand_new_value", "business_email", "business_main_x", "business_name", "main_color", "seasonal_offer_text"].sort(),
    );
    expect(row("0_webhook_url_form")).toMatchObject({ value: "https://hooks.example.test/x", secret: true, editable: true });
    expect(row("business_main_x")).toMatchObject({ secret: true });
  });

  it("groups by the Settings layout folders, with the catch-all last", () => {
    const titles = view.folders.map((f) => f.title);
    expect(titles[0]).toBe("Business");
    expect(titles).toContain("Brand colors");
    expect(titles[titles.length - 1]).toBe("More details");
  });

  it("marks locks, too-long values and duplicates", () => {
    expect(row("business_name")).toMatchObject({ locked: true, secret: false, editable: true, label: "Business name" });
    expect(row("main_color")?.locked).toBe(false);
    expect(row("seasonal_offer_text")).toMatchObject({ value: null, editable: false });
    expect(row("business_email")).toMatchObject({ editable: false });
  });

  it("carries the write-back flag and a failed read", () => {
    expect(view.writable).toBe(true);
    const failed = buildAdminValuesView({ tenantId: "T1", clientName: "Acme", read: { ok: false, reason: "retry" }, locked: new Set(), writable: false });
    expect(failed).toMatchObject({ writable: false, loadError: "retry", folders: [] });
  });
});
