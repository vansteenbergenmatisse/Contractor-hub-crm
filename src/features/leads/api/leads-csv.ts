// The export file: RFC 4180 quoting, CRLF line ends, and no cell a spreadsheet would run as a formula.
export type ExportRow = { name: string; source: string; date: string; phone: string; email: string; address: string };

const FORMULA_START = /^[\s "']*[=+\-@\t\r\n]/;

// A reader using another delimiter, or splitting lines first, ignores this file's quotes, so text after
// a delimiter can become its own cell, and a quote there is stripped as the cell's opening quote. The
// guard goes right before the trigger.
const FORMULA_AFTER_DELIMITER = /([,;\t\r\n][\s"']*)(?=[=+\-@])/g;

export function neutralize(value: string): string {
  const inner = value.replace(FORMULA_AFTER_DELIMITER, "$1'");
  return FORMULA_START.test(value) ? `'${inner}` : inner;
}

export function csvCell(value: string): string {
  const safe = neutralize(value);
  return /[",;\t\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

// US numbers read as (614) 555-0100, which no spreadsheet treats as a formula or a number. Any other
// value is kept as written and goes through the formula guard.
export function formatPhone(value: string): string {
  const digits = value.replace(/\D/g, "");
  const national = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  if (national.length === 10 && /^\+?1?[\d\s().-]+$/.test(value.trim())) return `(${national.slice(0, 3)}) ${national.slice(3, 6)}-${national.slice(6)}`;
  return value;
}

export function buildLeadsCsv(rows: readonly ExportRow[], includeContact: boolean, dateHeader = "Date"): string {
  const header = includeContact ? ["Name", "Source", dateHeader, "Phone", "Email", "Address"] : ["Name", "Source", dateHeader];
  const lines = rows.map((r) => {
    const base = [r.name, r.source, r.date];
    return (includeContact ? [...base, formatPhone(r.phone), r.email, r.address] : base).map(csvCell).join(",");
  });
  return [header.map(csvCell).join(","), ...lines].join("\r\n") + "\r\n";
}
