import { useEffect, useState } from 'react'
import type { PDFDocumentProxy } from 'pdfjs-dist'

export type PdfState =
  | { status: 'loading' }
  | { status: 'ready'; doc: PDFDocumentProxy }
  | { status: 'error' }

/**
 * Loads a PDF once for a given url. Callers should key the component on the url so state starts
 * fresh. Everything is torn down on unmount (and on the StrictMode dev double-invoke).
 */
export function usePdfDocument(url: string): PdfState {
  const [state, setState] = useState<PdfState>({ status: 'loading' })

  useEffect(() => {
    let cancelled = false
    const controller = new AbortController()
    let destroy: (() => Promise<void>) | null = null

    import('./pdfjs')
      .then(async ({ openPdf }) => {
        const task = await openPdf(url, controller.signal)
        destroy = () => task.destroy()
        if (cancelled) {
          void task.destroy()
          return
        }
        const doc = await task.promise
        if (cancelled) return
        setState({ status: 'ready', doc })
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'error' })
      })

    return () => {
      cancelled = true
      controller.abort()
      void destroy?.()
    }
  }, [url])

  return state
}
