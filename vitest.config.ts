import { defineConfig } from 'vitest/config'
import { cloudflareTest } from '@cloudflare/vitest-pool-workers'

// Runs tests inside the Workers runtime against worker/index.ts (via wrangler.jsonc).
export default defineConfig({
  plugins: [cloudflareTest({
      wrangler: { configPath: './wrangler.jsonc' },
      // The pool's bundled workerd is older than wrangler.jsonc's compatibility_date; tests only.
      miniflare: { compatibilityDate: '2026-08-22' },
    })],
  test: { include: ['test/**/*.test.ts'] },
})
