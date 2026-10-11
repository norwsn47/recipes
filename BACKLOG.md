# BACKLOG.md
Last updated: 11 October 2026

> A to-do list, so nothing gets forgotten. Open items only.
> - **Removing:** whoever finishes an item deletes its line in the same commit as the change (the project-manager for large changes, the main session for small ones). Add a `CHANGELOG.md` note only if it was a decision or a reversal.
> - **Adding:** only something you would actually do - a real bug, a feature idea you asked for, or a manual step you owe. You ask; the project-manager adds genuine follow-ups from a large change; Critical/High review and audit findings are added. Lower findings stay in the chat report until you triage them. Non-blocking review notes are never logged.
> - **Accepted or won't-fix:** never a to-do. One line in "Known and accepted" below, or a code comment where the issue sits in one place. Reviews and audits read that section and do not re-raise it.
> - **Entries are one to three lines:** what needs doing, not the history. Nothing here is actioned without explicit instruction.
> - **IDs are stable and never reused**, even after an item is deleted, so gaps are expected. Next free ID: **#14**.

---

## To do

### 5. Check two unverified Cloudflare points
At R2 setup, note whether a payment method is required. After launch, check in the dashboard whether static asset requests count toward the 100,000 requests/day Workers limit.

### 6. Set a Cloudflare billing/usage alert
Manual step for you, before launch: R2 can bill beyond the free tier, so set a billing or usage notification in the Cloudflare dashboard.

### 8. Replace the deprecated test pool
@cloudflare/vitest-pool-workers is renamed @cloudflare/vitest-plugin (warning on every test run). Do after the first feature (owner decision); also re-check the dev-only npm audit findings then.

### 9. Replace the placeholder home screen
The "API reachable" banner and "Setup complete" card are gone; src/App.tsx now has a minimal placeholder Home and /recipes/:id. Replace with the real recipe list and view (the Outbuild mark stays).

### 11. Fix account switch at the session-expiry overlay
If a different Google account signs in from the expiry overlay, src/auth/AuthContext.tsx:52 drops the user and shows the sign-in screen again. Set the new user and remount the route tree; add a test.

### 12. Add security headers
Add public/_headers with a CSP (allowing Google Identity Services), frame-ancestors and nosniff. Also consider inverting the CSRF verb check in worker/csrf.ts to treat everything except GET/HEAD/OPTIONS as mutating.

---

## Blocked / waiting on a decision or something external

<!-- Same format. Say what it is waiting on. -->

---

## Known and accepted

<!-- Not to-dos. Decisions not to fix something, so reviews and audits don't raise them again. -->
<!-- One line each: what, and why it's accepted. e.g. "Dialogs don't trap keyboard focus - accepted, low keyboard use (27 Sep 2026)" -->
- Only the owner's Google test users can sign in (Google app kept in Testing mode); they see Google's "app isn't verified" notice, and every signed-in user can view all recipes - chosen by the user (11 Oct 2026)
- One test user can fill the shared 5 GB cap and block uploads for everyone until the owner clears content by hand; residual R2 overage is bounded by the caps, not eliminated - accepted (11 Oct 2026)
- If the Workers or D1 free tier runs out, the app errors until 00:00 UTC (no bill) - accepted (11 Oct 2026)
- npm audit shows 5 high findings, all dev-only inside @cloudflare/vitest-pool-workers (nested undici/sharp/miniflare); none ship in the Worker; do not run `npm audit fix --force` - accepted pending backlog #8 (11 Oct 2026)
- HEIC files preview only in Safari; other browsers get a labelled download - accepted (11 Oct 2026)
- Moderation is manual in the D1/R2 dashboards; no in-app admin or report button; content of leavers/abusers stays until the owner deletes it on request - accepted (11 Oct 2026)
- No self-service data deletion; manual on request - accepted (11 Oct 2026)
- No in-app notice that recipes and uploads are visible to every signed-in user; the app must still never claim they are private - accepted (11 Oct 2026)
- Orphaned R2 files can remain if file deletion fails after a recipe delete; unreachable via the app, cleaned by hand - accepted (11 Oct 2026)
