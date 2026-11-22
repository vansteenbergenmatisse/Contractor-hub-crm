# Rotating `GHL_APP_SHARED_SECRET` (runbook, proposal, not yet exercised)

Why: HighLevel's signed user data for `/embed` has no documented timestamp or nonce, so a captured
payload keeps signing in until this secret changes (see the ticket 7 entry in `PROGRESS.md`). Rotate it
when a payload may have leaked, when someone with access leaves, or on a schedule the owner picks.
Embed sessions last one day, so a rotation also ends any session that came from a captured payload
within a day.

Each environment has its own HighLevel app, so rotate them one at a time and never share the value:
develop and staging use the Test app, production uses the live app (`docs/greenlane/build-prompt.md`
section 14 and 15).

Steps (the HighLevel menu names are not verified; check them in the Marketplace app settings):
1. In the Marketplace app for that environment, find the shared secret and generate a new one.
   Copy it straight into the next step. Do not paste it into chat, a ticket or a commit.
2. Immediately set `GHL_APP_SHARED_SECRET` in Vercel for the matching environment (production for
   `main`, Preview for `staging`, Preview for `develop`) and redeploy that branch. Between steps 1 and
   2 embed sign-in fails with 403; email and password sign-in is not affected.
3. Open `/embed` as a test user in the sub-account. Expect to land on Today. A 403 or "Open this page
   from inside HighLevel" means the two values differ.
4. Record the date and the environment in `PROGRESS.md` (never the value).

Rollback: put the old value back in both places. If it was not saved, there is none: HighLevel shows
the new secret only at generation (unverified), so keep the old one until step 3 passes.
