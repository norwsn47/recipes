import { defineConfig } from 'vitest/config'
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-pool-workers'

// Runs tests inside the Workers runtime against worker/index.ts (via wrangler.jsonc).
export default defineConfig(async () => {
  const migrations = await readD1Migrations('./migrations')
  return {
    plugins: [cloudflareTest({
      wrangler: { configPath: './wrangler.jsonc' },
      // The pool's bundled workerd is older than wrangler.jsonc's compatibility_date; tests only.
      miniflare: {
        compatibilityDate: '2026-08-22',
        // Test-only bindings: the migrations (applied in test/setup.ts) and a fake client ID.
        bindings: { TEST_MIGRATIONS: migrations, GOOGLE_CLIENT_ID: 'test-client-id.apps.googleusercontent.com' },
      },
    })],
    test: { include: ['test/**/*.test.ts'], setupFiles: ['./test/setup.ts'] },
  }
})
