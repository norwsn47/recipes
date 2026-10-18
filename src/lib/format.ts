// Small display helpers shared by the recipe list and the recipe page. Pure functions, no DOM or React.

/** The domain of a web link without a leading "www.", or null when it is not a usable http(s) URL. */
export function linkHostname(link: string): string | null {
  try {
    const url = new URL(link)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    return url.hostname.replace(/^www\./, '') || null
  } catch {
    return null
  }
}

/** "18 Oct", with the year added when it is not this year. */
export function shortDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const sameYear = d.getFullYear() === new Date().getFullYear()
  return d.toLocaleDateString('en-GB', sameYear ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' })
}
