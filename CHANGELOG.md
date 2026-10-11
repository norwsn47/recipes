# CHANGELOG.md
Last updated: 11 October 2026
> A record of decisions, reversals and notable behaviour changes, newest first. Git history is the full record of everything else, so most changes need no entry here.
> Whenever you add an entry, update the "Last updated:" date above.

---

## 11 October 2026 - Stack locked; usage limits reinstated; own session cookie
- Stack: React 18, Vite and Tailwind v4 single-page app on one Cloudflare Worker (static assets plus /api/*), with D1 and R2. wrangler approved as a dev dependency (wrangler only).
- Reversal: the earlier "no caps or rate limiting" decision is replaced. Limits now: 5 GB global storage, 100 MB and 50 recipes per user, about 20 writes per minute per user, plus the existing file and recipe limits. Reason: small family app, very low expected use, and R2 can bill overage.
- Sessions: the Google ID token is verified once at sign-in, then the app issues its own session cookie backed by a D1 sessions table (replaces verifying the Google token on every request).
- HEIC is stored as is: Safari previews it, other browsers get a download.

## 11 October 2026 - In-app Google sign-in replaces Cloudflare Access
- Decided by the user: the server verifies the Google ID token itself. Cloudflare Access is dropped.
- Why: with open sign-in, Access seats (assumed free cap of 50, unverified) could be filled by strangers and lock out the real group. Still auth work: no auth build without explicit user confirmation.
- Also decided: no caps or rate limiting, manual moderation by the owner, no visibility notice (recorded as accepted risks in BACKLOG and PRD).

## 11 October 2026 - Open Google sign-in (no email allowlist)
- Decided by the user: any Google account may sign in, after being warned that anyone with the link can view all recipes and upload files, of spam/abuse risk, and that they are responsible for hosted content. Edit and delete own recipes only still applies.
- Reverses the earlier Cloudflare Access plus email allowlist approach. The Access approval was conditional on Google SSO and an allowlist; with open sign-in the seat cap makes Access a poor fit. Sign-in layer is reopened (see PRD open questions).

<!-- Format:
## [date] - [decision or change]
- [what was decided or changed, and why]
- [any deviation from what was asked, or from the PRD in the build phase]
-->
