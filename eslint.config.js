import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'

// Flat config. typescript-eslint is not in the approved dependency set, so .ts/.tsx files
// are NOT linted here (the parser cannot read TypeScript syntax); `npm run typecheck` (tsc)
// covers them. Plain JS/MJS files (config, scripts) are linted.
export default [
  { ignores: ['dist/**', '.wrangler/**', 'node_modules/**', 'design-system/**', '**/*.ts', '**/*.tsx'] },
  js.configs.recommended,
  {
    files: ['**/*.{js,mjs,jsx}'],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    plugins: { 'react-hooks': reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },
]
