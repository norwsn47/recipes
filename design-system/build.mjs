// Builds dist/ from components/ and tokens.css. Only needed for the optional Claude Design sync;
// projects import components/ and tokens.css directly and do not need this.
import { build } from 'esbuild'
import { execFileSync } from 'node:child_process'
import { copyFileSync, mkdirSync } from 'node:fs'

mkdirSync('dist', { recursive: true })

await build({
  entryPoints: ['components/index.js'],
  outfile: 'dist/index.es.js',
  bundle: true,
  format: 'esm',
  jsx: 'automatic',
  loader: { '.js': 'jsx' },
  external: ['react', 'react/jsx-runtime', 'react-dom'],
  target: 'es2020',
})

execFileSync('npx', ['tailwindcss', '-i', 'tokens.css', '-o', 'dist/style.css', '--minify'], { stdio: 'inherit' })
copyFileSync('types/index.d.ts', 'dist/index.d.ts')
console.log('built dist/')
