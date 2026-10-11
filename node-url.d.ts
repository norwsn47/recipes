// Minimal typing for the one Node built-in vite.config.ts uses. @types/node is not in the
// approved dependency set, so this avoids installing it.
declare module 'node:url' {
  export function fileURLToPath(url: string | URL): string
}
