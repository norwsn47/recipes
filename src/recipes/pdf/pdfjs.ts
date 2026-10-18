// The only module that imports pdfjs-dist at runtime. Always loaded with a dynamic import() so the
// library and its worker stay out of the main bundle (and out of anything the tests load).
import * as pdfjs from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

// Same-origin copies of PDF.js data, emitted by the pdfjsStaticAssets plugin in vite.config.ts.
const standardFontDataUrl = new URL('/pdfjs/standard_fonts/', window.location.origin).href
const wasmUrl = new URL('/pdfjs/wasm/', window.location.origin).href

/** Fetches a PDF from the authenticated same-origin file route and opens it. */
export async function openPdf(url: string, signal: AbortSignal) {
  const res = await fetch(url, { credentials: 'same-origin', signal })
  if (!res.ok) throw new Error(`File request failed (${res.status})`)
  const data = new Uint8Array(await res.arrayBuffer())
  const task = pdfjs.getDocument({
    data,
    standardFontDataUrl,
    wasmUrl,
    // The page CSP has no 'wasm-unsafe-eval' or font data: sources, so ask PDF.js
    // for its plain-JS paths: JS image decoders, glyphs drawn as paths (no FontFace).
    useWasm: false,
    disableFontFace: true,
    useSystemFonts: false,
  })
  return task
}

export { pdfjs }
