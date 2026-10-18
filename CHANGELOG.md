# CHANGELOG.md
Last updated: 18 October 2026
> A record of decisions, reversals and notable behaviour changes, newest first. Git history is the full record of everything else, so most changes need no entry here.
> Whenever you add an entry, update the "Last updated:" date above.

---

## 18 October 2026 - Category filter is one at a time; header and settings
- Reversal (owner decision): the list's category filter selects one category at a time (tap another to switch, tap again for All), in a single sideways-scrolling row. Recipes can still have several categories.
- Header shows the app name on the left and a settings icon on the right; Sign out moved into a settings pop-up with a short description of the app.

## 11 October 2026 - Quick-add flow; link title lookup (reverses "link scraping out of scope", title only)
- Reversal (owner decision): the add screen now starts with "Paste a link" or "Add photo or file", and a pasted link gets a suggested recipe name. The server fetches the page once and reads only the title (og:title, then a small JSON-LD Recipe name, then the page title), as plain text of at most 100 characters. Nothing else is read, and nothing is stored, cached or logged. Importing ingredients, method, images or descriptions stays out of scope.
- The lookup is an authenticated, CSRF-protected endpoint with its own limit of about 10 per minute per user, http/https and default ports only, private and reserved hosts refused, at most 3 redirects, about 4 seconds, and 64 KB read. Failures leave the name guessed from the link's last path segment, with no error shown.
- Time tags are shown as "< 30 mins", "1 hr" and "1 hr +" everywhere; the stored values are unchanged. Categories and the time tag on add and edit are toggle chips. Notes sit behind "Add notes".

## 11 October 2026 - Sign-in limited to Google test users; app live
- Reversal (owner decision): the Google app stays in Testing mode permanently, so only test users the owner adds in Google Cloud Console can sign in. This replaces "any Google account may sign in". No Google publishing, Branding page or privacy policy needed.
- Live at https://recipes.outbuild.uk as Cloudflare Worker "recipes", deployed from GitHub main by Workers Builds. D1 database family-recipes-db created (WEUR).

## 11 October 2026 - TypeScript 6.0 with typescript-eslint
- TypeScript moved from 7.0 to 6.0 (owner decision) so typescript-eslint can be added; it supports TypeScript below 6.1 only. Lint now covers .ts/.tsx files.

## 11 October 2026 - Design system imported through a typed alias
- Components are imported as `@design-system/components` (Vite alias to the real components, TypeScript paths to design-system/types), because relative imports of the .jsx files are untyped and make className required. The design-system folder is still used in place and unmodified.
- Tests run against compatibility date 2026-08-22 (the test pool's workerd limit); wrangler.jsonc keeps 2026-10-11. vitest is pinned to ^4.1 to match the pool.

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
