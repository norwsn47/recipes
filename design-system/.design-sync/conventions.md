# Outbuild design system: conventions

A flat, white, mobile-first system: one green, generous white space, big confident type. Build with the components below and the CSS variables from `styles.css`.

## Setup
- No provider, theme wrapper or load order is needed. `styles.css` carries the tokens, the base type styles and every component's styles. Light theme only: there is no dark mode.
- The typeface is Bricolage Grotesque, loaded by `styles.css` from Google Fonts, falling back to system-ui.

## Compose with the components
Use these from `window.OutbuildDS` and never rebuild them: `Button`, `Input`, `Textarea`, `Field` (label, hint and error around one Input or Textarea), `SectionLabel`, `Card`, `CardTitle`, `Badge`, `Banner`, `Dialog`, `PageHeader`, `OutbuildMark`. Read each one's `.prompt.md` and `.d.ts` in `components/general/<Name>/` before using it.

## Style your own layout with inline styles and variables
There are no Tailwind utility classes to rely on: the shipped CSS contains only the classes the components use. For layout glue (flex, gap, padding, width) write inline `style` and reach for the tokens with `var(--name)`:
- Surfaces and text: `--background`, `--foreground`, `--card`, `--muted`, `--muted-foreground`, `--border`, `--input`.
- Actions: `--primary` and `--primary-foreground` (green), `--accent` and `--accent-foreground` (light green tint for hover and selected), `--ring` (focus).
- Highlight: `--highlight` and `--highlight-foreground` (amber).
- Errors: `--destructive` and `--destructive-foreground`.
- Charts: `--chart-1` to `--chart-5`. Shape: `--radius` (0.375rem). Depth: `--shadow-float`.

## Rules that keep it on brand
- The page is pure white. Warm off-white (`--muted`) is only for small supporting areas.
- Green (`--primary`) is the only interactive colour. Amber (`--highlight`) is for small highlights only, always with dark text, never a button or link. `--destructive` is for errors only.
- Flat: no shadows on cards or static surfaces (only floating dialogs use `--shadow-float`), no gradients, no blur.
- Controls are squarish (`--radius`); only badges and pills are fully round. Tap targets are at least 44px tall.
- Body text is 17px. Headings (`h1` to `h3`) are already bold with tight tracking in `styles.css`; do not restyle them. Small labels use `SectionLabel`.
- One primary `Button` per screen; secondary actions use `variant="secondary"` or `"ghost"`.
- Every home screen shows `OutbuildMark`.

## Where the truth lives
Read `styles.css` (and `_ds_bundle.css`, which it imports) before styling anything, and the per-component docs above.

## Example: a sign-in card
```jsx
const { Card, CardTitle, Field, Input, Button, Banner } = window.OutbuildDS
<div style={{ background: 'var(--background)', padding: 24, display: 'flex', justifyContent: 'center' }}>
  <div style={{ width: 360, display: 'flex', flexDirection: 'column', gap: 16 }}>
    <Card>
      <CardTitle>Sign in</CardTitle>
      <p style={{ margin: '0 0 16px', color: 'var(--muted-foreground)' }}>We will email you a link. No password needed.</p>
      <Field label="Email address" hint="The one you used before, or a new one.">
        <Input type="email" placeholder="you@example.com" />
      </Field>
      <div style={{ marginTop: 16 }}><Button full>Send my sign-in link</Button></div>
    </Card>
    <Banner>Check your email for a sign-in link.</Banner>
  </div>
</div>
```
