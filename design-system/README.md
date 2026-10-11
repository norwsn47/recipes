# design-system/

A starter template: the Outbuild design system, preloaded and ready to use with nothing to install. The kit is copied into each project, and the project's copy is then edited directly (tokens, components, rules) to suit it. At onboarding step 2.4 you review it (open `preview.html`) and either proceed as it is or ask for changes. If you empty the folder, the outbuild-design-director creates a system from scratch.

## What is here

```
design-system/
├── README.md          this file
├── DESIGN.md          the system's rules: colour, contrast, shape, type, layout, components
├── tokens.css         colour, radius, shadow and type variables (Tailwind v4), light only
├── components/        React + Tailwind components, no other packages needed
│   └── Button, Input, Textarea, Field, Card, Badge, Banner, Dialog, PageHeader, OutbuildMark
├── preview.html       open in a browser to see everything (needs internet for the Tailwind CDN)
└── fonts/, icons/     empty; add self-hosted fonts or icons here if needed
(also: package.json, build.mjs, types/ and .design-sync/ exist only for the optional Claude Design sync; projects can ignore or delete them)
```

## Using it in a project (no installs)

Use it in place. Do not copy it.

1. The app's main stylesheet imports the tokens once, for example `@import "../design-system/tokens.css";` (adjust the path). This also pulls in Tailwind v4, which scans the project folder, so the classes used in `design-system/components/` are picked up automatically.
2. Screens import components from the system, for example `import { Button, Field, Input } from '../design-system/components'`.
3. Nothing else is needed. `DESIGN.md` in this folder is the project's design file; edit it directly, or ask the design director to.

It needs **React 18 and Tailwind v4** (the kit's default stack is React, Vite and Tailwind v4). On a different stack, use `tokens.css` as plain CSS variables and follow `DESIGN.md` for the patterns; the components would need porting.

## Notes

- **`tokens.css` is maintained by hand.** It started as a tweakcn export (19 September 2026) and was then edited directly: contrast fixes, an orange highlight colour, light green tints, flat charts, bigger and bolder type. Change it here and update `preview.html` (paste the new CSS into its style block).
- **Contrast is checked**, not assumed: see `DESIGN.md`. The system is light only; there is no dark mode.
- **The font (Bricolage Grotesque) loads from Google Fonts** via an `@import` at the top of `tokens.css`. That sends visitors' IP addresses to Google. To avoid that, download the font into `fonts/` and replace the `@import` with an `@font-face` rule.
- **Not yet tried in a real project.** `preview.html` and the JSX syntax have been checked; the components have not been built into an app.

## If you swap in a different system

Check it against the Outbuild principles first (the design director does this and reports conflicts): one brand colour and at most two accents; flat by default; two radius families; system or one deliberate typeface; one primary action per screen; watch for defaults on the "avoid" list (blue primary buttons, `rounded-xl`, `shadow-lg`). Check the licence allows reuse. Agents do not edit files here without your confirmation.
