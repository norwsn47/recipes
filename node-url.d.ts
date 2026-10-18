// Minimal typing for the Node built-ins vite.config.ts uses. @types/node is not in the
// approved dependency set, so this avoids installing it.
declare module 'node:url' {
  export function fileURLToPath(url: string | URL): string
}
declare module 'node:fs' {
  export function readdirSync(path: string): string[]
  export function readFileSync(path: string): Uint8Array
}
