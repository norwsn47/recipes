import { useEffect, useState } from 'react'
import type { RefObject } from 'react'

/** Rounded content width of an element, updated (debounced) when it resizes. 0 until measured. */
export function useContainerWidth(ref: RefObject<HTMLElement | null>, debounceMs = 150): number {
  const [width, setWidth] = useState(0)

  useEffect(() => {
    const el = ref.current
    if (!el) return undefined
    let timer: ReturnType<typeof setTimeout> | undefined
    let first = true
    const observer = new ResizeObserver((entries) => {
      const w = Math.round(entries[0].contentRect.width)
      clearTimeout(timer)
      if (first) {
        first = false
        setWidth(w)
        return
      }
      timer = setTimeout(() => setWidth(w), debounceMs)
    })
    observer.observe(el)
    return () => {
      clearTimeout(timer)
      observer.disconnect()
    }
  }, [ref, debounceMs])

  return width
}
