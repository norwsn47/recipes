// Name suggestions for the add-recipe form. Pure functions, no DOM or React, so they can be unit tested.
// These only ever produce a suggestion for the name field; the person can always edit it.
import { MAX_TITLE } from './recipes'

function tidy(text: string): string {
  const spaced = text.replace(/[-_+]+/g, ' ').replace(/\s+/g, ' ').trim()
  if (!spaced) return ''
  return (spaced.charAt(0).toUpperCase() + spaced.slice(1)).slice(0, MAX_TITLE).trim()
}

function safeDecode(segment: string): string {
  try {
    return decodeURIComponent(segment)
  } catch {
    return segment
  }
}

const NON_SLUGS = new Set(['index', 'home', 'amp', 'print', 'view', 'recipe', 'recipes'])

/** True when a path segment looks like an identifier rather than words (digits only, a UUID, a hash, mostly digits). */
function looksLikeId(cleaned: string): boolean {
  const compact = cleaned.replace(/\s+/g, '')
  if (!/[a-z]/i.test(compact)) return true
  if (/^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i.test(compact)) return true
  if (!/\s/.test(cleaned) && compact.length >= 12 && /\d/.test(compact) && /^[0-9a-z]+$/i.test(compact)) return true
  const digits = (compact.match(/\d/g) ?? []).length
  return digits / compact.length > 0.5
}

/** A guess at the recipe name from the last path segment of a web address, or '' when there is no usable slug. */
export function nameFromUrl(value: string): string {
  let url: URL
  try {
    url = new URL(value.trim())
  } catch {
    return ''
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return ''
  const segments = url.pathname.split('/').filter(Boolean)
  const last = segments[segments.length - 1]
  if (!last) return ''
  const withoutExtension = safeDecode(last).replace(/\.[a-z0-9]{1,5}$/i, '')
  const cleaned = withoutExtension.replace(/[-_+]+/g, ' ').replace(/\s+/g, ' ').trim()
  if (!cleaned || NON_SLUGS.has(cleaned.toLowerCase()) || looksLikeId(cleaned)) return ''
  return tidy(cleaned)
}

const DEVICE_PREFIX = /^(img|dscn|dscf|dsc|pxl|mvimg|image|photo|picture|pic|screenshot|screen shot|scan|wp|document|file|untitled|download)(?![a-z])/i

/** A guess at the recipe name from a chosen file's name, or '' for camera-style or meaningless names. */
export function nameFromFileName(fileName: string): string {
  const base = fileName.replace(/\.[^./\\]+$/, '')
  const cleaned = base.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim()
  if (!cleaned) return ''
  const compact = cleaned.replace(/[^a-z0-9]/gi, '')
  const digits = (compact.match(/\d/g) ?? []).length
  if (compact.length === 0 || digits / compact.length > 0.5) return ''
  const prefix = DEVICE_PREFIX.exec(cleaned)
  if (prefix) {
    // "IMG 1234", "Screenshot 2026-10-11 at 12.00.00": only digits, separators and filler words follow.
    const rest = cleaned.slice(prefix[0].length).replace(/\b(at|am|pm|copy|edited)\b/gi, '').replace(/[^a-z]/gi, '')
    if (rest === '') return ''
  }
  return tidy(cleaned)
}
