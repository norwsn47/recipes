import { useEffect, useRef, useState } from 'react'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { useContainerWidth } from './useContainerWidth'

// iOS Safari refuses canvases much above 16 million pixels, so the backing store is capped.
const MAX_CANVAS_PIXELS = 16_000_000
// Phones hold only a few canvases at once, so each one is also held well under the hard limit.
const MAX_LIVE_CANVAS_PIXELS = 8_000_000
const MAX_DPR = 3

interface PageProps {
  doc: PDFDocumentProxy
  pageNumber: number
  width: number
  /** Extra backing-store sharpness on top of devicePixelRatio (the full-screen viewer uses 1.5). */
  oversample: number
  /** Aspect ratio (height / width) used until this page's real size is known. */
  fallbackRatio: number
  label: string
  /** True while the full-screen viewer is open: the canvas is released and nothing is drawn. */
  paused: boolean
}

function PdfPage({ doc, pageNumber, width, oversample, fallbackRatio, label, paused }: PageProps) {
  const wrapper = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const settled = useRef<Promise<unknown>>(Promise.resolve())
  const [seen, setSeen] = useState(false)
  const near = seen && !paused
  const [ratio, setRatio] = useState(fallbackRatio)
  const [drawn, setDrawn] = useState(false)
  const [failed, setFailed] = useState(false)

  // Only pages near the viewport are drawn; the rest keep a skeleton and no canvas memory.
  useEffect(() => {
    const el = wrapper.current
    if (!el) return undefined
    const observer = new IntersectionObserver((entries) => setSeen(entries[entries.length - 1].isIntersecting), {
      rootMargin: '600px 0px',
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const el = canvas.current
    if (!near || width <= 0 || !el) return undefined
    let cancelled = false
    let cancel: (() => void) | null = null
    let pageProxy: { cleanup: () => void } | null = null
    const previous = settled.current

    const run = (async () => {
      // A cancelled render must finish before the same canvas can be used again.
      await previous
      if (cancelled) return
      const page = await doc.getPage(pageNumber)
      pageProxy = page
      if (cancelled) return
      const base = page.getViewport({ scale: 1 })
      setRatio(base.height / base.width)
      const cssScale = width / base.width
      let backing = Math.min(window.devicePixelRatio || 1, MAX_DPR) * oversample
      const cssPixels = width * (width * (base.height / base.width))
      backing = Math.min(backing, Math.sqrt(Math.min(MAX_CANVAS_PIXELS, MAX_LIVE_CANVAS_PIXELS) / cssPixels))
      const viewport = page.getViewport({ scale: cssScale * backing })
      el.width = Math.floor(viewport.width)
      el.height = Math.floor(viewport.height)
      const task = page.render({ canvas: el, viewport })
      cancel = () => task.cancel()
      await task.promise
      if (!cancelled) {
        setDrawn(true)
        setFailed(false)
      }
    })().catch((err: unknown) => {
      const name = err instanceof Error ? err.name : ''
      if (!cancelled && name !== 'RenderingCancelledException') setFailed(true)
    })
    settled.current = run

    return () => {
      cancelled = true
      cancel?.()
      pageProxy?.cleanup()
      setDrawn(false)
    }
  }, [doc, pageNumber, width, oversample, near])

  // Leaving the neighbourhood frees the bitmap: shrink the canvas (the render effect's cleanup brings the skeleton back).
  useEffect(() => {
    if (near) return
    const el = canvas.current
    if (el) {
      el.width = 0
      el.height = 0
    }
  }, [near])

  return (
    <div ref={wrapper} data-page={pageNumber} className="relative w-full overflow-hidden rounded-lg border border-border bg-white" style={{ aspectRatio: `1 / ${ratio}` }}>
      {!drawn && (
        <div aria-hidden="true" className="absolute inset-0 animate-pulse bg-muted motion-reduce:animate-none" />
      )}
      <canvas ref={canvas} role="img" aria-label={label} className="block h-full w-full" />
      {failed && (
        <p role="status" className="absolute inset-x-0 top-1/2 -translate-y-1/2 px-3 text-center text-sm text-muted-foreground">
          Page {pageNumber} could not be drawn.
        </p>
      )}
    </div>
  )
}

/** Every page of the document, fitted to the width of this element and drawn as it scrolls near. */
export function PdfPages({ doc, name, oversample = 1, paused = false }: { doc: PDFDocumentProxy; name: string; oversample?: number; paused?: boolean }) {
  const container = useRef<HTMLDivElement>(null)
  const width = useContainerWidth(container)
  const [firstRatio, setFirstRatio] = useState(1.414)

  useEffect(() => {
    let cancelled = false
    doc.getPage(1).then((p) => {
      if (cancelled) return
      const v = p.getViewport({ scale: 1 })
      setFirstRatio(v.height / v.width)
    }, () => undefined)
    return () => {
      cancelled = true
    }
  }, [doc])

  const pages = Array.from({ length: doc.numPages }, (_, i) => i + 1)
  return (
    <div ref={container} className="flex w-full flex-col gap-3">
      {pages.map((n) => (
        <PdfPage
          key={n}
          doc={doc}
          pageNumber={n}
          width={width}
          oversample={oversample}
          paused={paused}
          fallbackRatio={firstRatio}
          label={`Page ${n} of ${doc.numPages} of ${name}`}
        />
      ))}
    </div>
  )
}
