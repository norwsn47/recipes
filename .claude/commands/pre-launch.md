---
description: Pre-launch audit
---

# /pre-launch - Pre-launch audit

Run a four-gate audit before any version goes live. Produce a GO / NO GO recommendation at the end. This audit is always exhaustive, in either phase: it reports every finding and never applies the triage filter used by `/full-audit` or the review gate.

## How to run this audit

Invoke the code-reviewer agent with the following brief:

"Run the full pre-launch audit for this project. First, read `CLAUDE.md` (including the `Phase:` and `Layout:` lines), `PRD.md` if one exists (build phase), `BACKLOG.md` (including 'Known and accepted') and `.env.example` to understand the project's stack, source directories, and confirmed features. In the iteration phase, derive the features and flows from the code and routes. Work through all four gates in order. Produce a GO / NO GO recommendation at the end.

## Gate 1 - Security sweep

Check the full codebase for:
- Hardcoded secrets, API keys, tokens, or credentials anywhere in the codebase
- Any endpoint that does not validate session/auth before returning user data
- Any user input that is passed to a database query without parameterisation
- Any CORS configuration that is too permissive
- Any sensitive data logged to the console

Report each finding as: FILE | LINE | ISSUE | SEVERITY (Critical / High / Medium / Low)

Critical or High findings block GO.

## Gate 2 - Accessibility check

Check every page component for:
- Interactive elements (buttons, links, inputs) missing accessible labels or aria attributes
- Images missing alt text
- Colour contrast - does the design rely on colour alone to convey meaning?
- Focus management - can the app be navigated by keyboard?
- Form inputs missing associated labels

Report each finding as: FILE | ELEMENT | ISSUE | SEVERITY

High findings block GO.

## Gate 3 - Real device checklist

This gate cannot be automated - output it as a checklist for the human to complete on a real device before launch. Tailor the checklist to the confirmed features and user flows of this specific project (from `PRD.md` in the build phase, or the code and routes in the iteration phase). Always include:

[ ] App loads correctly on iOS Safari (latest)
[ ] App loads correctly on Android Chrome (latest)
[ ] All tap targets are at least 44x44px
[ ] Text is readable without zooming at default font size
[ ] App works on a slow 3G connection (throttle in DevTools)
[ ] No horizontal scroll on any screen at 390px viewport width

Then add checklist items for each critical user flow (e.g. authentication, core feature interactions, sharing behaviour, any integrations).

Output this checklist and note that it must be completed manually. It does not block GO automatically - but any item that cannot be confirmed should be noted.

## Gate 4 - Known issues summary

Read BACKLOG.md and list every open item flagged as a known issue or bug, and every 'Known and accepted' entry. For each one, state whether it is a launch blocker or a post-launch item. Re-check accepted items against launch: something acceptable during the build may not be acceptable in front of real users. Anything under `CLAUDE.md` 'Always escalate' is listed separately for an explicit decision.

## Final recommendation

After all four gates:
- If any Critical or High security finding exists: NO GO - list the blockers
- If any High accessibility finding exists: NO GO - list the blockers
- If Gate 3 checklist is incomplete: FLAG - cannot confirm GO without real device test
- If all gates pass or have only Medium/Low findings: GO - list any post-launch items to track"
