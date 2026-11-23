# Proposal: Settings write-back to HighLevel custom values

Status: built, off by default. No live HighLevel write has been made.

## Why

The user's rule (2026-11-22): a value changed in the CRM's Settings must also change in that client's HighLevel sub-account.

## What changes

- `POST /api/settings/values` saves changed values for the session's tenant. Owners only. Admins, including during View as client, are refused.
- New feature `settings-write-back`. The `settings` feature stays free of network calls and receives the save function as a prop.
- New table `CustomValueChange`: actor, key, previous value, new value, outcome.

## Contract

Source: `GoHighLevel/highlevel-api-docs`, `apps/locations.json`, commit `0af86a4`.

- `GET /locations/{locationId}/customValues`, `Version: 2021-07-28`.
- `PUT /locations/{locationId}/customValues/{id}`, `Version: 2021-07-28`, body `{ name, value }`, both required. Documented responses: 200, 400, 401, 422.

Not verified on a real response: the PUT answer, whether stored tokens hold `locations/customValues.write`, HighLevel's rate limit, and whether a change fires anything in HighLevel.

## Rules

- Never creates or deletes a custom value. Never blanks one.
- Allowlisted keys only.
- Links must be https. No value may hold `<`, `>` or control characters.
- A value that changed in HighLevel after the owner loaded it is not overwritten.
- A key listed twice in HighLevel is not written.
- No audit row means no write.
- Stricter than the form: no quotes, backticks, backslashes, merge or template tags, or Unicode control and format characters. Email, phone, coordinates and hours have their own checks.
- A PUT is never retried and never forces a token refresh.
- Every write is read back. The read decides `saved`; an unconfirmed write is audited and shown as `unknown`.
- One save per tenant at a time (90-second lease). A later batch re-reads first, and no batch starts after 25 seconds.
- `main_color` and `text_on_main_color` are written as a pair. The first is restored, with its own audit row, only when the second certainly did not apply and the first was not edited meanwhile. Otherwise the pair is reported as unconfirmed.
- A timeout or 5xx may still land, so it is never reported as "did not save", and the tenant's lease stays until it expires.

## Disable and rollback

- Clear `SETTINGS_WRITE_BACK_ENABLED` in Vercel and redeploy to stop all writes.
- Remove a tenant id from `SETTINGS_WRITE_BACK_TENANTS` to stop one client.
- To undo a change, read `previousValue` from `CustomValueChange` and set it back in HighLevel. There is no undo button yet.

## Security baseline

```yaml
security_baseline:
  applies: true
  surfaces:
    - id: POST /api/settings/values
      tier: STATE-MUTATING
      controls:
        C1_auth:        { status: covered, mechanism: "session guard, owner of the session tenant only, exact origin check, admin and client view refused" }
        C2_rate_limit:  { status: covered, mechanism: "hitRateLimit, proposal 10 saves per hour per user and 30 per tenant, fails closed" }
        C3_input:       { status: covered, mechanism: "strict body, at most 20 keys, allowlist, 2000 chars, form validators, https links, no markup" }
        C4_timeout:     { status: covered, mechanism: "10s per call, at most 3 at once, no automatic PUT retry; flag is the breaker" }
        C5_output_rate: { status: opted_out, justification: "non-streaming JSON with one short status per submitted key, at most 20" }
        C6_redaction:   { status: opted_out, justification: "no LLM; logs hold step and status, never values" }
        C7_idempotency: { status: covered, mechanism: "a repeat finds HighLevel already holds the value and skips the PUT" }
        C8_concurrency: { status: covered, mechanism: "per-tenant lease plus a fresh read before each batch; an edit made in HighLevel during one PUT can still be overwritten, because HighLevel has no version token" }
        C9_audit:       { status: covered, mechanism: "CustomValueChange row per key, written before the PUT: actor, target, previous, new, outcome, time" }
        C10_abuse:      { status: covered, mechanism: "rate limits, per-tenant allowlist and kill switch; no paid API" }
```
