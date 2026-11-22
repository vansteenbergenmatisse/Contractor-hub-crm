import { initialsOf } from "../api/invoices";

// The row's round avatar: the customer's initials, or a card icon while the invoice has no name.
export function InvoiceAvatar({ name }: { name: string }) {
  if (name) return <span className="fd-av" aria-hidden="true">{initialsOf(name)}</span>;
  return (
    <span className="fd-av" aria-hidden="true">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
        <rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="9" cy="11" r="2.2" />
        <path d="M5.8 16c.5-1.6 1.7-2.4 3.2-2.4s2.7.8 3.2 2.4M15 10h3.5M15 13.5h3.5" />
      </svg>
    </span>
  );
}
