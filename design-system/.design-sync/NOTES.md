# Design sync notes

Synced to Claude Design project "Outbuild Design System" (d5fac6d7-4309-40aa-aebb-1338a79c6710) on 20 September 2026: 12 components, all previews authored and graded good, render check clean (12/12).

## How this repo is set up for the sync
- `design-system/` is a small package: `package.json`, `build.mjs` (esbuild for `components/` to `dist/index.es.js`, Tailwind CLI for `tokens.css` to `dist/style.css`), and hand-written types in `types/index.d.ts` (copied to `dist/index.d.ts`). `npm run build` rebuilds `dist/`.
- The converter is staged in `.ds-sync/` (gitignored) with its own deps (esbuild, ts-morph, @types/react, playwright). Playwright's Chromium lives in `~/Library/Caches/ms-playwright`.
- Re-sync: `npm run build`, re-copy the scripts into `.ds-sync/`, then `node .ds-sync/resync.mjs --config .design-sync/config.json --node-modules ./node_modules --entry ./dist/index.es.js --out ./ds-bundle --remote .design-sync/.cache/remote-sync.json` (fetch `_ds_sync.json` from the project into that cache path first).

## Gotchas found
- The shipped CSS is Tailwind-compiled, so it contains only the utility classes the components use. The design agent is told (conventions.md) to style its own layout with inline styles and `var(--token)` values.
- `Dialog` uses a fixed overlay. Its preview wraps it in a `transform` box so it renders inside the card. Overrides: Banner, Card and PageHeader use `cardMode: column`.
- The preview screenshots found a real bug: `PageHeader` squashed its side buttons on a long title. Fixed with `min-w-max` on the side slots; the static `preview.html` was updated to match.
- `.d.ts` files are hand-written: keep `types/index.d.ts` in step with the components.

## Re-sync risks
- Bricolage Grotesque loads from Google Fonts at runtime (`[FONT_REMOTE]`), so previews and designs need internet to show the right font, and it sends visitor IPs to Google.
- If `tokens.css` changes, also paste it into `preview.html` (static copy), rebuild, and re-sync.
- Previews only cover 2 to 4 states per component. Hover and focus states are not shown.
- No Storybook, so previews were graded on the absolute rubric only (no reference render).
