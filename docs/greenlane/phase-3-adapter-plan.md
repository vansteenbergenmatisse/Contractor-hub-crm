# Phase 3 adapter plan (approved by the user, 2026-11-22)

Written 2026-11-22. Endpoint facts: `docs/greenlane/hl-api-notes.md`. Scope of this plan: read-only wiring of Leads and Today's lead rows. Sends, stage moves, workflow changes and custom-value writes are out of scope and each needs its own approved plan.

**Global rule (user):** new clients are created from a snapshot of JCR Landscaping with the same variables. Everything must work for any such sub-account. Code holds no JCR-specific id, name or value. Ids that differ per sub-account (pipelines, stages, calendars) are looked up per tenant at runtime.

**Status 2026-11-22:** Leads, Today lead rows, Inbox, Pipeline and Calendar follow this pattern. An admin client view uses the stored token only (`docs/view-as-client-and-token-renewal.md`).

## Adapter

- **Owner:** `src/features/highlevel` holds every HighLevel call. Leads and Today receive an injected reader from their server page, following `settings/api/load-values.ts`.
- **Auth:** tenant from the server session (`getRequestUser`), token through `withLocationToken(tenantId, call)`. The browser never holds a token. Scope: `contacts.readonly`, `opportunities.readonly`.
- **Parsing:** strict parsers at the adapter. Unknown fields are ignored; a malformed row is dropped and counted.
- **Data class:** customer names, phones, emails and addresses. Never logged. Logs hold counts, step names and status codes only.
- **Results:** each load returns `ready`, `empty`, `reconnect` or `unavailable`. It never falls back to sample data.
- **Limits:** 10-second timeout (existing client). One page of the newest contacts per load. A 429 becomes `unavailable`, with no automatic retry during a page render.
- **Idempotency and webhooks:** not applicable, because this plan has no writes and no new webhook.
- **Disable path:** one server flag per page returns the page to `unavailable`.

## Tickets

1. **P3-1. Stop sample data reaching real clients.** Remove the mock search rows and mock inbox count from the `(app)` layout. Pages not wired yet show the existing "Not available yet" treatment instead of sample data.
2. **P3-2. Real Leads, read-only.** Contacts from `POST /contacts/search`, with loading, empty, reconnect and error states. Fix the crash when a refreshed lead has no stored status (`LeadRow.tsx:28`).
3. **P3-3. Today's lead rows** from the same loader, keyed by contact id instead of name.

## Tests

Mocked adapter and contract tests for request, response, error and paging. Tenant isolation test. CI never calls HighLevel. The Leads and Today tests that scan for `fetch(` and `highlevel` stay valid because the reader is injected; render-call updates are deliberate changes.

## Approval gates

- Live reads of JCR are approved (user, 2026-11-22). Reads only; record field names and shapes, never customer values.
- Any write, send, publish, scope change or deployment still needs approval.
- A security review by `project-os:security-reviewer` runs before P3-2 is called done.

## Open decisions

- Decided: unwired pages show "Not available yet".
- Decided for now: Leads shows the received time from `dateAdded` and hides the waiting chip. A true wait time can follow with the Inbox ticket.
- Open: how free-text `source` values map to the six channels in the design. Default until decided: map only exact, obvious values, and leave anything else unlabelled and out of the per-channel counts.
