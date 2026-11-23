# Routes: Notify the client when you start

Status: built behind flags, off by default. Tested with a mocked HighLevel only. No live tag, text or contact change has been made, and the migration is not applied.

## What it does

With the toggle on, tapping **Start** on the **next** job or estimate adds one HighLevel contact tag, once. A HighLevel workflow sends the message. This app never writes or sends a text.

It never fires from passing by (no location is used), for another appointment type, on a repeat tap, on a reload, or from a second crew member.

## The workflow to build in HighLevel (proposal contract)

1. **Trigger:** Contact Tag, filter **Tag Added**, tag exactly `crm_on_my_way`. Do not trigger on tag removal: the app removes the tag before re-adding it.
2. **Allow re-entry:** turn on "Allow re-entry" (or the current equivalent), because the same contact can have jobs on different days.
3. **Action:** send the "on my way" SMS or email. The wording lives in the workflow.
4. **No removal step is needed.** The app removes an old tag itself. A workflow step that removes it is harmless.
5. Publish, then test it on a contact with your own phone number. Not on JCR (`loop-constraints.md` rule 12).

The tag carries no job details. If the message should name a time or address, the workflow must read it from the contact's appointment; whether that merge data is available was not checked.

## HighLevel calls

Source: official OpenAPI files `apps/contacts.json` and `apps/calendars.json`, `GoHighLevel/highlevel-api-docs` at commit `0af86a4`.

| Step | Call | Version | Scope |
|---|---|---|---|
| Re-read today | existing calendar read | 2021-04-15 | `calendars/events.readonly` |
| Find the contact | `GET /calendars/events` (field `contactId`) | 2021-04-15 | `calendars/events.readonly` |
| Check location and tags | `GET /contacts/{contactId}` | 2021-07-28 | `contacts.readonly` |
| Remove an old tag | `DELETE /contacts/{contactId}/tags`, body `{"tags":["crm_on_my_way"]}` | 2021-07-28 | `contacts.write` |
| Add the tag | `POST /contacts/{contactId}/tags`, same body | 2021-07-28 | `contacts.write` |

**Not verified on a real response:** that these calls behave as documented; that a remove followed at once by an add fires a Tag Added trigger; how HighLevel treats tag letter case (compared case-insensitively here); that `contactId` is on every real event.

## Job or estimate rule

HighLevel's event has no job or estimate field (`docs/greenlane/hl-api-notes.md`), so the **calendar name** decides. After trimming and ignoring letter case, it must be exactly `Job`, `Jobs`, `Estimate` or `Estimates`. Anything else fails closed: no notification, and the card says "Only calendars named Job or Estimate can notify a client." A name like "Job Interview" is refused on purpose. A client whose calendars have other names must rename them, or this rule must be extended.

## Which job may notify

Exactly one job at a time: `notifyId`, the first job today, by start time, that is neither done nor past. The server re-reads the day and refuses every other id.

- **Done:** HighLevel status is `showed`, `completed` or `noshow`.
- **Past:** not done, and its end time has been reached (`end <= now`). A job ending at this exact moment is past.
- **In progress is not past** (`start <= now < end`). A crew member running late can still notify the client until the job's end time.
- A past job left open no longer blocks the day: it is skipped, and its own Start is refused as `past`. `nextId` (first job not done) is unchanged and still drives the card when notifying is off. With notifying on, the card shows `notifyId`, or `nextId` if no job can notify.
- A job in progress holds the turn until it ends or is marked done, so the job after it cannot notify earlier. This includes a job that runs past today, and a crew that leaves early without marking the job done.
- A wrong-type job holding the turn is refused and does not pass the turn on.

## Once per job

Table `RouteStartNotification`, unique on tenant + appointment id, written as `pending` **before** any tag call (migration `20261123140000_route_start_notification`, not applied).

| Result | Row shows | Stored | Tried again? |
|---|---|---|---|
| Tag added | Client notified | `notified` | No |
| HighLevel refused, or an old tag could not be removed | Could not notify | `failed` | No |
| No answer (timeout, network, 5xx) | Not sure if notified | `unconfirmed` | No |
| Crash after the claim | Not sure if notified | `pending` | No |
| Refused before the claim (wrong type, not next, no contact, past, day incomplete, read failed) | Could not notify, with the reason | nothing | Yes, nothing was sent |

An appointment moved to another day keeps its id, so it does not notify a second time.

## Turning it on

Needs, in this order: the migration applied, the workflow published, then `ROUTES_NOTIFY_ENABLED=true` and `ROUTES_NOTIFY_TENANTS=<tenant id>` (exact ids, comma separated, no wildcard). Clearing `ROUTES_NOTIFY_ENABLED` stops everything at once.

## Security baseline

```yaml
security_baseline:
  applies: true
  surfaces:
    - id: POST /api/routes/notify
      tier: STATE-MUTATING
      controls:
        C1_auth:        { status: covered, mechanism: "session cookie, exact Origin, owner or office only, admins and View as client refused, tenant from session" }
        C2_rate_limit:  { status: covered, mechanism: "30/hour per user, 120/hour per tenant (proposals); limiter failure denies" }
        C3_input:       { status: covered, mechanism: "1 KB body, exactly one field, appointment id pattern; re-verified against today's server read" }
        C4_timeout:     { status: covered, mechanism: "10s per HighLevel call; no retry or breaker on the write, because a blind retry could text a client twice" }
        C5_output_rate: { status: opted_out, justification: "fixed-size JSON, no streaming" }
        C6_redaction:   { status: opted_out, justification: "no LLM; logs hold step and status only" }
        C7_idempotency: { status: covered, mechanism: "unique tenant + appointment row; a replay returns the stored result" }
        C8_concurrency: { status: covered, mechanism: "insert with skip-duplicates before the external call; one racer wins" }
        C9_audit:       { status: covered, mechanism: "RouteStartNotification row: actor, tenant, appointment, outcome, times" }
        C10_abuse:      { status: covered, mechanism: "server kill switch, tenant allowlist, one trigger per appointment, rate limits" }
```
