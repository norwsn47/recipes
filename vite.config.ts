import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { cloudflare } from '@cloudflare/vite-plugin'

// The design system is used in place (never copied). Import its components as
// '@design-system/components': Vite resolves the real .jsx, TypeScript uses
// design-system/types/index.d.ts (see tsconfig.app.json paths).
// design-system/ ships its own node_modules (including a React copy); dedupe makes Vite
// resolve react from this project's root so the app never ends up with two Reacts.
export default defineConfig({
  plugins: [react(), tailwindcss(), cloudflare()],
  resolve: {
    dedupe: ['react', 'react-dom'],
    alias: {
      '@design-system/components': fileURLToPath(new URL('./design-system/components/index.js', import.meta.url)),
    },
  },
})
