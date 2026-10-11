---
description: Agent setup and process health check
---

# /process-review - Agent setup and process health check

A periodic, on-demand health check for the agent setup itself. Not part of the standing review gate - run it manually when the docs or the process start feeling heavy (roughly monthly, or whenever it feels warranted).

## How to run this review

Invoke the code-reviewer agent with the following brief:

"Review the agent setup in `.claude/` and the project docs for redundancy and bloat. This is a static read and report exercise - do not fix anything without explicit confirmation first.

1. **Unnecessary reads.** Cross-check each agent's 'first action' / required reads against what the agent actually does. Does any agent read files it does not need for its real job? Does any agent read a file in full when recent entries or one section would do?

2. **Duplicated instruction text.** Is there instruction text repeated across agent files that should live once in `CLAUDE.md` with a one-line reference instead? Flag any block that appears in more than two files.

3. **Doc bloat.** Has `PRD.md` (build phase), `CHANGELOG.md`, or `BACKLOG.md` accumulated stale or duplicated content - changelog detail duplicated in the PRD header, build-planning language left in place after a feature shipped, an ever-growing summary line that is never trimmed, resolved items never removed? `BACKLOG.md` should be a short to-do list: flag entries that read as history, reviewer notes nobody will action, items that are already done, or accepted items sitting in the to-do sections instead of 'Known and accepted'. Estimate what share of open items the user would actually act on in the next month; a small share means an admission problem, not a triage problem. Also flag any finding that bypassed the stated severity threshold, and any accepted item that has come back in a later review or audit.

4. **Change-size gating.** Check the last ~10 `CHANGELOG.md` entries against CLAUDE.md's 'Change size' section. Are small changes skipping the full flow as intended? Are large changes actually getting a scope check (PRD alignment in the build phase, confirmation with the user in the iteration phase) and a BACKLOG update? Did anything under `CLAUDE.md` 'Always escalate' get filtered out on severity alone?

5. **Phase readiness (build phase only).** Is the project ready for `/graduate`? Report the evidence for each: the product is live; one person decides scope; work arrives as individual small requests; `PRD.md` is being updated after the code to match what shipped, rather than before it; agent handoffs routinely carry an empty 'Deviations' or PRD field; an agent exists only to maintain one document. Also report any reason to stay in the build phase (several people deciding scope, an outside stakeholder who signs off a spec, regulated work). Recommend graduating or not; never run `/graduate` yourself.

Report findings only, grouped by the five headings above. Do not edit anything. End with a short list of the changes you would recommend, for the user to accept or decline."
