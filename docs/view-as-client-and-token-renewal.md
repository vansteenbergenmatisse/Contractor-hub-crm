# View as client and background token renewal

Written 2026-11-22. Reviewed by an independent security agent (code reading only). Not yet proven against a real HighLevel response.

## View as client

- A Forge Forward admin presses **View client** on `/admin/clients`. The app then reads that client's data, read-only, for up to one hour.
- The admin's session never changes and stays tenantless, so every write route still refuses it. A signed httpOnly cookie, bound to the admin and the tenant, only tells server pages which client to read. It is re-checked on every request.
- While viewing: a banner with Exit, no visit sync, no mailbox prompt, no token renewal, Settings apply disabled.
- HighLevel reads use the stored token only (`withStoredLocationToken`, `getBrandReadOnly`, `getTenantCustomValuesReadOnly`) and a per-admin limit. An expired stored token shows "unavailable".
- Audit lines (`client_view_started`, `client_view_read`, `client_view_ended`) hold ids only.
- Kill switch: server flag `CLIENT_VIEW_DISABLED=true`.
- Known: sign-out does not clear the cookie, so the same admin resumes the view after signing in again within the hour. A different admin is refused.

## Background token renewal

- `renewDueTokens` (`src/features/highlevel/api/token-renewal.ts`) renews agency tokens, then location tokens, through the token service's row lock. Logs hold counts only.
- **Daily cron** (`/api/integrations/sync`, 26-hour window, one run per hour at most). Vercel runs crons on production only, and the route needs `CRON_SECRET` (set for Production on 2026-11-22). It starts once `vercel.json` reaches `main` and production is deployed.
- **Admin visit** (after an admin who is not viewing a client opens `/admin/clients`, 6-hour window, once per 10 minutes). This is what keeps dev and staging connected, so on those environments a token can still expire if no admin opens the page.
- A 401 from HighLevel can force one token replacement per tenant per 10 minutes (`claimForcedRefresh`). If another request already replaced the token, the stored one is used.

## Known open risks

- A worst-case renewal job (about 70 seconds of stacked timeouts) can exceed the 60-second function limit. If the function dies after HighLevel rotated a token and before the save, a location heals by re-minting, but an agency token needs a reinstall.
- If the request holding the forced-refresh claim fails briefly, a dead token can show "reconnect" for up to 10 minutes. Nothing is written.
- The Calendar and Inbox limits count page loads, not HighLevel calls. Calendar can make many calls per load.
- More than about what fits in the 15-second job budget per run is skipped and counted (`skipped=` in the log). The start of the list is random, so skipped clients vary.

## Security baseline

```yaml
security_baseline:
  applies: true
  surfaces:
    - id: POST /api/admin/clients/[tenantId]/view
      tier: HIGH-STAKES
      controls:
        C1_auth:        { status: covered, mechanism: "admin guard plus exact Origin check" }
        C2_rate_limit:  { status: covered, mechanism: "60 per hour per admin, fails closed" }
        C3_input:       { status: covered, mechanism: "tenant id pattern, tenant must exist and not be uninstalled" }
        C4_timeout:     { status: covered, mechanism: "existing Prisma pool timeouts; no outbound HTTP call" }
        C5_output_rate: { status: covered, mechanism: "fixed-size JSON answer" }
        C6_redaction:   { status: covered, mechanism: "no LLM; answer and logs hold no customer data" }
        C7_idempotency: { status: covered, mechanism: "repeat call only reissues the same caller's cookie" }
        C8_concurrency: { status: covered, mechanism: "no shared row is written; the cookie is per browser" }
        C9_audit:       { status: covered, mechanism: "client_view_started and client_view_read, ids only" }
        C10_abuse:      { status: covered, mechanism: "rate limit and CLIENT_VIEW_DISABLED kill switch" }
    - id: POST /api/admin/view/exit
      tier: HIGH-STAKES
      controls:
        C1_auth:        { status: covered, mechanism: "exact Origin check; clears only the caller's own cookie" }
        C2_rate_limit:  { status: covered, mechanism: "no database write or outbound call to limit; platform limits apply" }
        C3_input:       { status: covered, mechanism: "takes no input" }
        C4_timeout:     { status: covered, mechanism: "session lookup only, existing timeouts" }
        C5_output_rate: { status: covered, mechanism: "fixed-size JSON answer" }
        C6_redaction:   { status: covered, mechanism: "no LLM; no customer data" }
        C7_idempotency: { status: covered, mechanism: "clearing a cookie twice has the same result" }
        C8_concurrency: { status: covered, mechanism: "no shared state" }
        C9_audit:       { status: covered, mechanism: "client_view_ended for an admin, id only" }
        C10_abuse:      { status: covered, mechanism: "no cost-bearing work" }
```
