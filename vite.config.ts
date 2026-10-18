import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import type { Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { cloudflare } from '@cloudflare/vite-plugin'

// Serves PDF.js data files from our own origin (the CSP allows 'self' only): standard fonts for
// PDFs that do not embed theirs, and the plain-JS image decoders used instead of wasm. Dev: middleware.
// Build: emitted into dist/client/pdfjs/. Kept out of the main bundle; fetched only when a PDF opens.
const PDFJS_DIRS: Array<{ dir: string; keep: (f: string) => boolean }> = [
  { dir: 'standard_fonts', keep: (f) => /\.(pfb|ttf)$/.test(f) },
  { dir: 'wasm', keep: (f) => f.endsWith('_nowasm_fallback.js') },
]
const pdfjsRoot = fileURLToPath(new URL('./node_modules/pdfjs-dist/', import.meta.url))
function pdfjsStaticAssets(): Plugin {
  const files = PDFJS_DIRS.flatMap(({ dir, keep }) => readdirSync(pdfjsRoot + dir).filter((f: string) => keep(f)).map((f) => ({ dir, f })))
  return {
    name: 'pdfjs-static-assets',
    configureServer(server) {
      server.middlewares.use('/pdfjs/', (incoming, outgoing, next) => {
        // @types/node is not installed, so the Node request and response are typed by hand.
        const req = incoming as unknown as { url?: string }
        const res = outgoing as unknown as { setHeader(k: string, v: string): void; end(b: Uint8Array): void }
        const [dir, f] = (req.url ?? '').split('?')[0].split('/').filter(Boolean)
        if (!files.some((x) => x.dir === dir && x.f === f)) return next()
        res.setHeader('content-type', f.endsWith('.js') ? 'text/javascript' : 'application/octet-stream')
        res.end(readFileSync(`${pdfjsRoot}${dir}/${f}`))
      })
    },
    generateBundle() {
      if (this.environment.name !== 'client') return
      for (const { dir, f } of files) {
        this.emitFile({ type: 'asset', fileName: `pdfjs/${dir}/${f}`, source: readFileSync(`${pdfjsRoot}${dir}/${f}`) })
      }
    },
  }
}

// The design system is used in place (never copied). Import its components as
// '@design-system/components': Vite resolves the real .jsx, TypeScript uses
// design-system/types/index.d.ts (see tsconfig.app.json paths).
// design-system/ ships its own node_modules (including a React copy); dedupe makes Vite
// resolve react from this project's root so the app never ends up with two Reacts.
export default defineConfig({
  plugins: [react(), tailwindcss(), cloudflare(), pdfjsStaticAssets()],
  resolve: {
    dedupe: ['react', 'react-dom'],
    alias: {
      '@design-system/components': fileURLToPath(new URL('./design-system/components/index.js', import.meta.url)),
    },
  },
})
