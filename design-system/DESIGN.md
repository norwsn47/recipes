# Outbuild design system
Last updated: 18 October 2026

A starter template, not a fixed spec. This is the design system every new project starts from: the rules for using `tokens.css` and `components/`. The kit is copied into each project, and from then on the project's copy is edited directly to suit it (colours, type, components, rules). Every UI agent reads this file, so keep it accurate when you change things; there is no separate project `DESIGN.md`.

## Principles in one line each
Flat, white, one green, generous space, big confident type. Restraint over richness; one primary action per screen; the UI frames the content.

## Colour
- **Background and surfaces are pure white** (`background`, `card`, `popover`, `sidebar`). The warm off-white (`muted`, `secondary`) is for small supporting areas only: table headers, quiet fills.
- **Green (`primary`, `#2D6A4F`, the Munro Tracker green) is the only interactive colour.** Buttons, links, active states, focus ring. Nothing else that is tappable is coloured.
- **Light green tint (`accent`)** is for hover, selected and highlighted fills. Text on it uses `accent-foreground`.
- **Amber-orange (`highlight`, `#FCA106`)** is for small highlights only: badges, a key data point, one chart series. Never body text, never a button or link. Dark text on it (`highlight-foreground`), never white.
- **Rust (`destructive`)** is for errors and destructive actions only.
- Text: `foreground` for content, `muted-foreground` for secondary text. Both pass 4.5:1 on white.

## Contrast (checked)
Text at least 4.5:1; icons, control borders, focus rings and chart series at least 3:1. The one exception is the amber highlight (`highlight`, `#FCA106`, about 2:1 on white): it is a fill colour, always carries dark text (8.4:1), and an amber chart series needs a direct label or a thin dark outline. `border` (about 1.5:1) is decorative only (card outlines, dividers); form fields use `input` (3.8:1). The system is light only: there is no dark mode.

## Shape and depth
- Flat. No shadows on cards or static surfaces (all shadow tokens are zero). Only `shadow-float` (dialogs, popovers) casts a shadow.
- No gradients, no blur or glass effects, anywhere (including charts: solid fills only).
- Controls use `rounded-lg` (0.375rem, squarish). Pills (badges) use `rounded-full`. Never a large radius on a large element.

## Type
- Bricolage Grotesque (loaded by `tokens.css`), falling back to the system font stack.
- Body 17px. Headings bold (700) with slightly negative tracking; h1 scales from 32px to 44px. Small labels are uppercase, semibold, slightly tracked (`SectionLabel`).
- Character comes from weight and scale. At most four weights.

## Layout and touch
- Design for a phone first, one hand. Tap targets at least 44px (`min-h-11`); inline links get padding so they reach it too.
- One primary action per screen; secondary actions are `secondary` or `ghost` buttons.
- White space separates and groups; it is never filler.

## Components (`components/`)
`Button`, `Input`, `Textarea`, `Field` (label, hint, error, wired for screen readers), `SectionLabel`, `Card`, `Badge`, `Banner`, `Dialog` (focus trap, Escape, focus return), `PageHeader` (title can never overlap the side buttons), `OutbuildMark`. Reuse these before writing new ones; a new component follows the same rules.

## The Outbuild mark
Every Outbuild app shows `OutbuildMark` on its home screen: app name in heavy weight, "by Outbuild ↗" in regular weight and the muted colour, linking to https://outbuild.uk in a new tab.

## Deliberate choices
Where this system departs from the general Outbuild design language on purpose, so it is not re-argued later:
- **A distinctive typeface** (Bricolage Grotesque) is used throughout, instead of the system font stack.
- **All headings are bold (700)**, not only the single most important text on a screen.
- **Body text is 17px**, and headings are large, for readability outdoors and a confident, IKEA-like feel.
- **Two accents beyond the brand green:** the amber highlight and the error rust, each with a defined job.
- **Light only.** There is no dark mode.
- **Family Recipes shows the Outbuild mark in the settings pop-up**, not on the home screen (owner decision, 18 October 2026).
