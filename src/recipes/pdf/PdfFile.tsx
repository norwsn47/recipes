import { useRef, useState } from 'react'
import { formatBytes } from '../../lib/recipes'
import type { RecipeFile } from '../../lib/recipes'
import { FileViewer } from '../FileViewer'
import { PdfPages } from './PdfPages'
import { usePdfDocument } from './usePdfDocument'
import { FileLinks, ViewButton } from '../fileParts'

/** A PDF shown inline page by page, with a full-screen viewer. Key this on file.url. */
export function PdfFile({ file }: { file: RecipeFile }) {
  const state = usePdfDocument(file.url)
  const [open, setOpen] = useState(false)
  const trigger = useRef<HTMLElement | null>(null)

  if (state.status === 'error') {
    return (
      <>
        <p role="alert" className="text-sm text-destructive">
          {file.name} could not be shown here. You can still open or save it.
        </p>
        <FileLinks file={file} openLabel={`Open ${file.name} (${formatBytes(file.size)})`} />
      </>
    )
  }

  return (
    <>
      {state.status === 'loading' ? (
        <>
          <p role="status" className="text-sm text-muted-foreground">Loading {file.name}...</p>
          <div aria-hidden="true" className="aspect-[1/1.414] w-full animate-pulse rounded-lg border border-border bg-muted motion-reduce:animate-none" />
        </>
      ) : (
        <>
          <ViewButton
            name={file.name}
            onOpen={(el) => {
              trigger.current = el
              setOpen(true)
            }}
          >
            <PdfPages doc={state.doc} name={file.name} paused={open} />
          </ViewButton>
          {open && (
            <FileViewer title={file.name} onClose={() => setOpen(false)} returnFocusTo={trigger}>
              <div className="mx-auto w-full max-w-4xl">
                <PdfPages doc={state.doc} name={file.name} oversample={1.5} />
              </div>
            </FileViewer>
          )}
        </>
      )}
      <FileLinks file={file} />
    </>
  )
}
