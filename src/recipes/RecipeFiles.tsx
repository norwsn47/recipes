import { useRef, useState } from 'react'
import { SectionLabel } from '@design-system/components'
import { formatBytes } from '../lib/recipes'
import type { RecipeFile } from '../lib/recipes'
import { FileViewer } from './FileViewer'
import { FileLinks, ViewButton, downloadUrl, linkClass } from './fileParts'
import { PdfFile } from './pdf/PdfFile'

function Download({ file, label }: { file: RecipeFile; label?: string }) {
  return (
    <a href={downloadUrl(file.url)} download={file.name} className={linkClass}>
      {label ?? 'Download'} {file.name} ({formatBytes(file.size)})
    </a>
  )
}

function ImageFile({ file }: { file: RecipeFile }) {
  const [open, setOpen] = useState(false)
  const trigger = useRef<HTMLElement | null>(null)
  return (
    <>
      <ViewButton
        name={file.name}
        onOpen={(el) => {
          trigger.current = el
          setOpen(true)
        }}
      >
        <img src={file.url} alt={file.name} loading="lazy" className="block h-auto w-full rounded-lg border border-border" />
      </ViewButton>
      <FileLinks file={file} />
      {open && (
        <FileViewer title={file.name} onClose={() => setOpen(false)} returnFocusTo={trigger}>
          <div className="flex h-full items-center justify-center">
            <img src={file.url} alt={file.name} className="h-auto max-h-full max-w-full object-contain" />
          </div>
        </FileViewer>
      )}
    </>
  )
}

/**
 * HEIC support is detected by trying to load the file as an image (Safari can, other browsers fire
 * an error). The image stays visually hidden until it has loaded, so there is no broken-image flash.
 */
function HeicFile({ file }: { file: RecipeFile }) {
  const [state, setState] = useState<'trying' | 'ok' | 'failed'>('trying')
  if (state === 'failed') {
    return (
      <a href={downloadUrl(file.url)} download={file.name} className={linkClass}>
        Download HEIC photo (cannot be previewed in this browser): {file.name} ({formatBytes(file.size)})
      </a>
    )
  }
  return (
    <>
      <img
        src={file.url}
        alt={file.name}
        className={state === 'ok' ? 'h-auto max-w-full rounded-lg border border-border' : 'sr-only'}
        onLoad={() => setState('ok')}
        onError={() => setState('failed')}
      />
      {state === 'ok' ? (
        <div className="flex flex-wrap gap-x-5">
          <a href={file.url} target="_blank" rel="noopener noreferrer" className={linkClass}>
            Open full size<span className="sr-only"> ({file.name}, opens in a new tab)</span>
          </a>
          <Download file={file} />
        </div>
      ) : (
        <p role="status" className="text-sm text-muted-foreground">Checking whether {file.name} can be previewed...</p>
      )}
    </>
  )
}

export function RecipeFiles({ files }: { files: RecipeFile[] }) {
  if (files.length === 0) return null
  return (
    <div className="space-y-2">
      <SectionLabel>Files</SectionLabel>
      <ul className="flex flex-col gap-5">
        {files.map((f) => (
          <li key={f.id} className="flex min-w-0 flex-col gap-1">
            {f.contentType === 'application/pdf' ? <PdfFile key={f.url} file={f} /> : f.contentType === 'image/heic' ? <HeicFile file={f} /> : <ImageFile file={f} />}
          </li>
        ))}
      </ul>
    </div>
  )
}
