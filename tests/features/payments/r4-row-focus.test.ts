import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

describe("R4-3: rows take no focus, as in the design", () => {
  it.each(["src/features/payments/components/PaymentRowItem.tsx", "src/features/automations/components/AutomationRow.tsx"])("%s has no tabIndex on the row", (file) => {
    expect(source(file)).not.toMatch(/\{\.\.\.gestures\} tabIndex/);
  });
});
