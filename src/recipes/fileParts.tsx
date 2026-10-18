import type { ReactNode } from 'react'
import { formatBytes } from '../lib/recipes'
import type { RecipeFile } from '../lib/recipes'

export const linkClass =
  'inline-flex min-h-11 items-center text-primary underline [overflow-wrap:anywhere] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring'

export const downloadUrl = (url: string) => `${url}?download=1`

/** The real button that wraps a preview and opens the full-screen viewer. */
export function ViewButton({ name, onOpen, children }: { name: string; onOpen: (trigger: HTMLElement) => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={(e) => onOpen(e.currentTarget)}
      aria-label={`View ${name} full screen`}
      className="block w-full cursor-zoom-in rounded-lg text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      {children}
    </button>
  )
}

/** File name and size, then a small Download link (and an open-in-new-tab link when asked for). */
export function FileLinks({ file, openLabel }: { file: RecipeFile; openLabel?: string }) {
  return (
    <div className="flex flex-wrap items-center gap-x-5">
      {openLabel && (
        <a href={file.url} target="_blank" rel="noopener noreferrer" className={linkClass}>
          {openLabel}<span className="sr-only"> (PDF, opens in a new tab)</span>
        </a>
      )}
      {!openLabel && (
        <p className="min-w-0 text-sm text-muted-foreground [overflow-wrap:anywhere]">
          {file.name} ({formatBytes(file.size)})
        </p>
      )}
      <a href={downloadUrl(file.url)} download={file.name} className={linkClass}>
        Download<span className="sr-only"> {file.name} ({formatBytes(file.size)})</span>
      </a>
    </div>
  )
}
