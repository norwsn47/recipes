# BACKLOG.md
Last updated: 18 October 2026

> A to-do list, so nothing gets forgotten. Open items only.
> - **Removing:** whoever finishes an item deletes its line in the same commit as the change (the project-manager for large changes, the main session for small ones). Add a `CHANGELOG.md` note only if it was a decision or a reversal.
> - **Adding:** only something you would actually do - a real bug, a feature idea you asked for, or a manual step you owe. You ask; the project-manager adds genuine follow-ups from a large change; Critical/High review and audit findings are added. Lower findings stay in the chat report until you triage them. Non-blocking review notes are never logged.
> - **Accepted or won't-fix:** never a to-do. One line in "Known and accepted" below, or a code comment where the issue sits in one place. Reviews and audits read that section and do not re-raise it.
> - **Entries are one to three lines:** what needs doing, not the history. Nothing here is actioned without explicit instruction.
> - **IDs are stable and never reused**, even after an item is deleted, so gaps are expected. Next free ID: **#18**.

---

## To do

### 5. Check two unverified Cloudflare points
At R2 setup, note whether a payment method is required. After launch, check in the dashboard whether static asset requests count toward the 100,000 requests/day Workers limit.

### 6. Set a Cloudflare billing/usage alert
Manual step for you, before launch: R2 can bill beyond the free tier, so set a billing or usage notification in the Cloudflare dashboard.

### 8. Replace the deprecated test pool
@cloudflare/vitest-pool-workers is renamed @cloudflare/vitest-plugin (warning on every test run). Do after the first feature (owner decision); also re-check the dev-only npm audit findings then.

### 15. Tighten CSP img-src
img-src is 'self' data: https: in public/_headers. Uploads now exist and src/ loads only same-origin images, so narrow it to 'self' data:, then load the sign-in screen once to confirm the Google button still renders.

### 16. Measure upload CPU after deploy
Upload one 25 MB multi-file recipe on the deployed Free Worker and check CPU time (error 1102 means over 10 ms). If it fails, move to Workers Paid or build a streaming one-file-per-request upload.

### 17. Smoke-test the link title lookup after deploy
Apply migration 0004 to remote D1 first. Then paste real recipe links (BBC Good Food, a site that blocks bots, a bad URL), confirm the name fills or quietly keeps the guess, and check CPU time for /api/link-title in the dashboard (10 ms limit).

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
- Orphaned R2 files can remain if file deletion fails after a recipe delete, or if a write is cut off between the R2 upload and the D1 save; unreachable via the app, not counted by quotas, cleaned by hand - accepted (11 Oct 2026)
- Link-title lookup cannot detect a public hostname whose DNS points at a private address (DNS rebinding); bounded by Cloudflare's network isolation, sign-in, 10 lookups a minute, default ports only and title-only output from 2xx HTML - accepted (18 Oct 2026)
