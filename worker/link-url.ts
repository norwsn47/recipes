// Pure URL safety rules for the link-title lookup. No I/O, so it can be tested with a plain table.
//
// What Workers' own network isolation covers (and what it does not):
//  - A Worker's fetch() runs on Cloudflare's edge, not inside our network. It cannot reach this
//    machine's loopback, nor Cloudflare's internal or private ranges, so classic SSRF against a
//    cloud metadata service (169.254.169.254) or localhost services does not apply the way it does
//    on a server we host. We still reject those targets here (defence in depth, and a clear 400).
//  - It does NOT cover a public hostname whose DNS A/AAAA record points at a private or reserved
//    address. A Worker cannot see the resolved IP before connecting, so that cannot be detected
//    here. Residual risk: the lookup could be aimed at whatever that name resolves to, from
//    Cloudflare's network; only the title text of an HTML 2xx response is ever returned.
//  - Only default ports are allowed (80 for http, 443 for https). Recipe sites use them, and it
//    stops the endpoint being used to probe other ports on public hosts.

export const MAX_URL_LENGTH = 2000

/** Names that are never public sites (RFC 6761 / 6762 / 8375 and common private-network suffixes). */
const BLOCKED_SUFFIXES = [
  'localhost', 'local', 'internal', 'home.arpa', 'lan', 'intranet', 'corp', 'home',
  'localdomain', 'test', 'invalid', 'example', 'onion', 'arpa',
]

/** IPv4 ranges that are not public unicast: [first address, prefix length]. */
const V4_BLOCKED: ReadonlyArray<readonly [number, number]> = [
  [0x00000000, 8], // this network
  [0x0a000000, 8], // 10/8 private
  [0x64400000, 10], // 100.64/10 CGNAT
  [0x7f000000, 8], // loopback
  [0xa9fe0000, 16], // link-local, includes the metadata address
  [0xac100000, 12], // 172.16/12 private
  [0xc0000000, 24], // 192.0.0/24 IETF protocol assignments
  [0xc0000200, 24], // TEST-NET-1
  [0xc0586300, 24], // 6to4 relay anycast
  [0xc0a80000, 16], // 192.168/16 private
  [0xc6120000, 15], // 198.18/15 benchmarking
  [0xc6336400, 24], // TEST-NET-2
  [0xcb007100, 24], // TEST-NET-3
  [0xe0000000, 4], // multicast
  [0xf0000000, 4], // reserved, includes broadcast
]

/** Parses a dotted-quad into a 32-bit number, or null if it is not exactly that form. */
function parseV4(host: string): number | null {
  const parts = host.split('.')
  if (parts.length !== 4) return null
  let n = 0
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null
    const v = Number(p)
    if (v > 255) return null
    n = n * 256 + v
  }
  return n
}

export function isBlockedV4(n: number): boolean {
  return V4_BLOCKED.some(([base, bits]) => {
    const size = 2 ** (32 - bits)
    return n >= base && n < base + size
  })
}

/** Expands an IPv6 literal (no brackets) to 8 groups, or null if malformed. */
function parseV6(host: string): number[] | null {
  let text = host
  // A trailing dotted quad (::ffff:1.2.3.4) becomes two hex groups.
  const lastColon = text.lastIndexOf(':')
  if (text.includes('.')) {
    const v4 = parseV4(text.slice(lastColon + 1))
    if (v4 === null) return null
    text = `${text.slice(0, lastColon + 1)}${(v4 >>> 16).toString(16)}:${(v4 & 0xffff).toString(16)}`
  }
  const halves = text.split('::')
  if (halves.length > 2) return null
  const toGroups = (s: string): string[] => (s === '' ? [] : s.split(':'))
  const head = toGroups(halves[0])
  const tail = halves.length === 2 ? toGroups(halves[1]) : []
  const missing = 8 - head.length - tail.length
  if (halves.length === 1 ? missing !== 0 : missing < 1) return null
  const all = [...head, ...Array<string>(halves.length === 2 ? missing : 0).fill('0'), ...tail]
  if (all.length !== 8) return null
  const out: number[] = []
  for (const g of all) {
    if (!/^[0-9a-f]{1,4}$/i.test(g)) return null
    out.push(parseInt(g, 16))
  }
  return out
}

/**
 * IPv6 is allow-listed: only global unicast 2000::/3 is accepted, minus the ranges inside it that
 * are not public sites (2001::/23 IETF protocols incl. Teredo, 2001:db8::/32 documentation, and
 * 2002::/16 6to4, which embeds an IPv4 address). Loopback ::1, unspecified ::, IPv4-mapped
 * ::ffff:0:0/96, NAT64 64:ff9b::/96, unique-local fc00::/7, link-local fe80::/10 and multicast
 * ff00::/8 all sit outside 2000::/3 and are therefore rejected.
 */
export function isBlockedV6(g: number[]): boolean {
  if ((g[0] & 0xe000) !== 0x2000) return true
  if (g[0] === 0x2001 && (g[1] & 0xfe00) === 0) return true // 2001::/23
  if (g[0] === 0x2001 && g[1] === 0x0db8) return true
  if (g[0] === 0x2002) return true
  return false
}

/** True when the host (as `URL.hostname` gives it, brackets included for IPv6) must not be fetched. */
export function isBlockedHost(hostname: string): boolean {
  let host = hostname.toLowerCase()
  if (host === '') return true
  if (host.startsWith('[')) {
    if (!host.endsWith(']')) return true
    const groups = parseV6(host.slice(1, -1))
    return groups === null || isBlockedV6(groups)
  }
  if (host.endsWith('.')) host = host.slice(0, -1)
  if (host === '' || !host.includes('.')) return true // dotless: localhost, intranet names, bare labels
  const v4 = parseV4(host)
  if (v4 !== null) return isBlockedV4(v4)
  // The URL parser turns 2130706433, 0x7f.1 and octal forms into dotted quads before we get here.
  // Anything still ending in a number is not a valid host, so refuse it rather than guess.
  const labels = host.split('.')
  if (/^(\d+|0x[0-9a-f]*)$/i.test(labels[labels.length - 1])) return true
  return BLOCKED_SUFFIXES.some((s) => host === s || host.endsWith(`.${s}`))
}

/**
 * Parses and checks a URL string for an outbound lookup. Returns the parsed URL, or null when it is
 * not acceptable: over 2,000 characters, unparseable, not http(s), has credentials, a non-default
 * port, or a blocked host. Used for the pasted URL and again for every redirect target.
 */
export function parseSafeUrl(raw: string, base?: string): URL | null {
  if (raw.length > MAX_URL_LENGTH) return null
  let url: URL
  try {
    url = base === undefined ? new URL(raw) : new URL(raw, base)
  } catch {
    return null
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
  if (url.username !== '' || url.password !== '') return null
  if (url.port !== '') return null // the parser empties the scheme's default port, so any left is non-default
  if (isBlockedHost(url.hostname)) return null
  if (url.href.length > MAX_URL_LENGTH) return null
  return url
}
