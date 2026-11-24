import type { ValueRow } from "../types";

// The identity values of 01_Business_essentials that must never stay the template's (JCR's) own.
// Hours, city, button text and the like may rightly match the template, so they never warn.
const IDENTITY = ["business_name", "business_owner_name", "business_phone_number", "business_email", "business_address", "business_website_url", "business_logo", "business_favicon_url"];

export function identityKeys(essentialKeys: readonly string[]): string[] {
  return IDENTITY.filter((key) => essentialKeys.includes(key));
}

export const WARNING_BUDGET_MS = 1_500;
export const MAX_WARNING_READS = 60;

type WarningInput = {
  templateTenantId: string;
  tenantIds: readonly string[];
  keys: readonly string[];
  // A cached read (the brand service's 5-minute cache). A throw or a late answer means unknown.
  read: (tenantId: string) => Promise<readonly ValueRow[]>;
  labelOf: (key: string) => string;
  budgetMs?: number;
};

// Per client: labels of identity values that equal the template's non-blank value. A client whose
// values are not known inside the budget is left out (no warning), and so is the template itself.
export async function templateWarnings(input: WarningInput): Promise<Record<string, string[]>> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), input.budgetMs ?? WARNING_BUDGET_MS);
  });
  const known = (tenantId: string) =>
    Promise.race([input.read(tenantId).then((rows) => rows, () => null), late]).catch(() => null);
  try {
    const others = input.tenantIds.filter((id) => id !== input.templateTenantId).slice(0, MAX_WARNING_READS);
    const [template, ...clients] = await Promise.all([known(input.templateTenantId), ...others.map(known)]);
    if (!template) return {};
    const templateValues = new Map(template.filter((row) => input.keys.includes(row.key) && row.value.trim() !== "").map((row) => [row.key, row.value.trim()]));
    if (templateValues.size === 0) return {};
    const out: Record<string, string[]> = {};
    others.forEach((tenantId, index) => {
      const rows = clients[index];
      if (!rows) return;
      const same = new Set(rows.filter((row) => templateValues.get(row.key) === row.value.trim()).map((row) => row.key));
      const labels = input.keys.filter((key) => same.has(key)).map(input.labelOf);
      if (labels.length > 0) out[tenantId] = labels;
    });
    return out;
  } finally {
    clearTimeout(timer);
  }
}
