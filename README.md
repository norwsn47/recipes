# Outbuild Starter Kit

An agentic workflow for turning a new idea into a shipped app with Claude Code. Drop it into a project folder and start.

## Start

Open the folder in Claude Code and say:

> "Use the project-manager to start this session."

On a new project (no `Phase:` set in `CLAUDE.md`), it runs the onboarding below. Agents can't talk to you directly: they return their questions and the main session asks you, then carries on. (In the Claude Code CLI you can instead run the whole session as the project-manager with `claude --agent project-manager`, so it talks to you directly.) Once v1 is shipped, use `PLAYBOOK.md` for everyday moves, and run `/graduate` when you're ready to drop the PRD (see "After v1" below).

The kit ships with a ready-to-use design system in `design-system/` (open `design-system/preview.html` to see it). Every project starts from it: at step 2.4 you review it in the preview and either proceed as it is or ask the outbuild-design-director for changes.

Optional: drop logo files into `assets/logos/` and project images into `assets/images/` before starting.

## What's in here

```
/your-project/
├── CLAUDE.md          rules and guardrails (the authority for how work is done)
├── README.md          this file
├── PLAYBOOK.md        everyday moves once v1 is shipped
├── BACKLOG.md         a short to-do list
├── CHANGELOG.md       decisions and reversals
├── assets/            logos/ and images/
├── design-system/     the Outbuild design system: tokens, components, rules, preview (see its README)
├── scripts/hooks/    pre-commit date check (optional, see CLAUDE.md)
└── .claude/
    ├── agents/        the specialist agents
    └── commands/      /full-audit, /pre-launch, /process-review, /graduate
```

`PRD.md` is created during setup and retired by `/graduate` after v1. `.env.example` (environment variable names, no values) is created at scaffold. Design comes from `design-system/DESIGN.md`; that is the project's one design file, and the project's copy can be edited directly.

## The agents

| Agent | Role |
|---|---|
| `project-manager` | Runs onboarding. Plans and orchestrates large changes. Keeps `BACKLOG.md` current. Stops before your localhost review and merge. |
| `product-owner` | Build phase only. Owns `PRD.md`: creates and pressure-tests it, keeps it accurate, checks alignment when product behaviour changes. Retired with the PRD by `/graduate`. |
| `outbuild-design-director` | Carries the Outbuild design philosophy. Changes the design system when you ask, at the step 2.4 review gate or later. |
| `frontend-developer` | Builds UI from the design system, in place. Always reads `design-system/DESIGN.md` first. |
| `backend-developer` | Builds APIs, database, auth, integrations. Strict on secrets. |
| `code-reviewer` | Read-only reviewer for large or risky changes and the audit commands. Never edits or commits. |
| `debugger` | Root-cause investigation when something is broken. |

The main session (you and Claude) creates branches, makes commits, does small changes directly, and measures performance when asked (there is no performance agent). Agents never branch, commit, push or merge.

## Onboarding stages

1. **Define.** The project-manager hands to the product-owner, which asks clarifying questions, writes `PRD.md`, then pressure-tests it. Don't move on until the PRD is tight.
2. **Stack and design review.** You confirm the tech stack (the PM recommends one built on React and Tailwind, because the design system needs it; Next.js or Astro if you need server rendering) and the integrations, and the product-owner records them in the PRD. Then a design review gate: you open `design-system/preview.html` and either proceed with the default look or ask for changes. The design system is a starter template that you can edit directly for the project.
3. **Scaffold.** An empty project structure that builds without errors, with the design system wired in (tokens imported, components importable in place), reviewed by the code-reviewer, with a test suite set up.
4. **Build.** Feature by feature. Each feature is a large change: the project-manager plans it and dispatches the builders and the reviewer, then hands back for your localhost review.

## After v1: the iteration phase

The PRD earns its keep while the app is being built: it is the only place the spec exists. Once v1 is live and you are making small changes yourself, the code and tests describe the app better than a document updated after the fact. Run `/graduate` to retire `PRD.md` and the product-owner, keep the out-of-scope list and deliberate product rules in `CLAUDE.md`, and switch to the lighter iteration workflow. Stay in the build phase if several people decide scope, someone outside the build signs off a spec, or the work needs an audit trail.

## The review gate

Defined once, in `CLAUDE.md` ("Review gate"). It scales with change size: small changes need lint, tests and your localhost check; large or risky changes also get the code-reviewer, and (build phase) a PRD alignment check if behaviour changed. Security, privacy, data loss and untrue copy always come to you, whatever their severity.
