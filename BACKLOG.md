# BACKLOG.md
Last updated: 11 October 2026

> A to-do list, so nothing gets forgotten. Open items only.
> - **Removing:** whoever finishes an item deletes its line in the same commit as the change (the project-manager for large changes, the main session for small ones). Add a `CHANGELOG.md` note only if it was a decision or a reversal.
> - **Adding:** only something you would actually do - a real bug, a feature idea you asked for, or a manual step you owe. You ask; the project-manager adds genuine follow-ups from a large change; Critical/High review and audit findings are added. Lower findings stay in the chat report until you triage them. Non-blocking review notes are never logged.
> - **Accepted or won't-fix:** never a to-do. One line in "Known and accepted" below, or a code comment where the issue sits in one place. Reviews and audits read that section and do not re-raise it.
> - **Entries are one to three lines:** what needs doing, not the history. Nothing here is actioned without explicit instruction.
> - **IDs are stable and never reused**, even after an item is deleted, so gaps are expected. Next free ID: **#7**.

---

## To do

### 1. Create the Google OAuth client
Manual step for you: create a web OAuth client in Google Cloud (free) for in-app sign-in. Client ID and secret go only in Cloudflare secrets / local env, never the repo. Needed before the auth build.

### 2. Create the Cloudflare account
Manual step for you: set up the Cloudflare account (Workers, D1, R2). Zero Trust / Access is no longer needed.

### 3. Add the GitHub repo URL as the remote
Manual step: give the main session the repo URL once created, so it can add the remote.

### 4. Decide whether to install wrangler
Stage 2 decision: wrangler (Cloudflare CLI) is not installed and is needed to deploy and manage D1/R2. Ask before installing.

### 5. Verify Cloudflare free-tier limits
Check R2 and D1 free limits on official Cloudflare pages, and whether the free plan hard-stops or can bill overage (no caps are set), before locking the stack.

### 6. Decide how HEIC photos are handled
Stage 2 question: convert in browser, convert on server, or store as is with download fallback. May need a new dependency - ask first.

---

## Blocked / waiting on a decision or something external

<!-- Same format. Say what it is waiting on. -->

---

## Known and accepted

<!-- Not to-dos. Decisions not to fix something, so reviews and audits don't raise them again. -->
<!-- One line each: what, and why it's accepted. e.g. "Dialogs don't trap keyboard focus - accepted, low keyboard use (27 Sep 2026)" -->
- Any Google account can sign in, so anyone with the address can view all recipes and upload files; spam/abuse possible, owner responsible for content - chosen by the user (11 Oct 2026)
- No per-user caps, global storage cap or rate limiting; a signed-in user could fill free storage or exhaust free-tier limits - accepted by the user (11 Oct 2026)
- If the free tier runs out, saves and uploads fail until the owner acts - accepted (11 Oct 2026)
- Moderation is manual in the D1/R2 dashboards; no in-app admin or report button; content of leavers/abusers stays until the owner deletes it on request - accepted (11 Oct 2026)
- No self-service data deletion; manual on request - accepted (11 Oct 2026)
- No in-app notice that recipes and uploads are visible to every signed-in user; the app must still never claim they are private - accepted (11 Oct 2026)
- Orphaned R2 files can remain if file deletion fails after a recipe delete; unreachable via the app, cleaned by hand - accepted (11 Oct 2026)
