import { describe, expect, it } from 'vitest'
import { isBlockedHost, parseSafeUrl } from '../worker/link-url'

const host = (raw: string) => new URL(raw).hostname

describe('URL normalisation in this runtime (the host check relies on it)', () => {
  it('turns numeric IPv4 forms into dotted quads and compresses IPv6', () => {
    expect(host('http://2130706433/')).toBe('127.0.0.1')
    expect(host('http://0x7f.1/')).toBe('127.0.0.1')
    expect(host('http://0177.0.0.1/')).toBe('127.0.0.1')
    expect(host('http://127.1/')).toBe('127.0.0.1')
    expect(host('http://0xA9FEA9FE/')).toBe('169.254.169.254')
    expect(host('http://[::ffff:127.0.0.1]/')).toBe('[::ffff:7f00:1]')
    expect(host('http://[0:0:0:0:0:0:0:1]/')).toBe('[::1]')
  })
})

describe('isBlockedHost', () => {
  const blocked = [
    'localhost', 'LOCALHOST', 'foo.localhost', 'printer.local', 'db.internal', 'router.home.arpa',
    'nas.lan', 'intranet', 'wiki', 'a.test', 'x.invalid', 'x.example', 'abc.onion', 'localhost.',
    '127.0.0.1', '127.255.255.254', '0.0.0.0', '0.1.2.3', '10.0.0.1', '10.255.255.255',
    '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254', '169.254.0.1',
    '100.64.0.1', '100.127.255.255', '192.0.0.1', '192.0.2.5', '198.18.0.1', '198.19.255.255',
    '198.51.100.1', '203.0.113.9', '224.0.0.1', '239.255.255.255', '240.0.0.1', '255.255.255.255',
    '[::1]', '[::]', '[::ffff:7f00:1]', '[::ffff:a00:1]', '[::ffff:169.254.169.254]',
    '[fc00::1]', '[fd12:3456::1]', '[fe80::1]', '[febf::1]', '[ff02::1]', '[64:ff9b::7f00:1]',
    '[2001::1]', '[2001:db8::1]', '[2002:7f00:1::]', '[1::1]', '[3fff::1]x', '[::1',
    '999.1.1.1', '1.2.3', '1.2.3.4.5',
  ]
  it.each(blocked)('blocks %s', (h) => expect(isBlockedHost(h)).toBe(true))

  const allowed = [
    'example.com', 'www.bbcgoodfood.com', 'sub.domain.co.uk', 'xn--nxasmq6b.com', 'EXAMPLE.COM.',
    '8.8.8.8', '1.1.1.1', '172.15.0.1', '172.32.0.1', '100.63.255.255', '100.128.0.1',
    '169.253.0.1', '192.169.0.1', '198.17.0.1', '198.20.0.1', '223.255.255.255',
    '[2606:4700:4700::1111]', '[2a00:1450:4009:81f::200e]', '[2001:4860:4860::8888]',
    'localhostess.com', 'notlocal.com', 'my-internal.com',
  ]
  it.each(allowed)('allows %s', (h) => expect(isBlockedHost(h)).toBe(false))
})

describe('parseSafeUrl', () => {
  const rejected = [
    'ftp://example.com/', 'file:///etc/passwd', 'javascript:alert(1)', 'data:text/html,hi', 'gopher://example.com',
    'https://user:pass@example.com/', 'https://user@example.com/', 'https://:pw@example.com/',
    'http://localhost/', 'http://127.0.0.1/', 'http://2130706433/', 'http://0x7f.1/', 'http://0177.0.0.1/',
    'http://[::1]/', 'http://[::ffff:127.0.0.1]/', 'http://169.254.169.254/latest/meta-data/',
    'http://intranet/', 'https://example.com:8443/', 'http://example.com:8080/', 'https://example.com:80/',
    'not a url', '', 'example.com/no-scheme', 'https://', `https://example.com/${'a'.repeat(2000)}`,
  ]
  it.each(rejected)('rejects %s', (u) => expect(parseSafeUrl(u)).toBeNull())

  it('accepts ordinary and default-port URLs', () => {
    expect(parseSafeUrl('https://example.com/recipe?id=1#top')?.href).toBe('https://example.com/recipe?id=1#top')
    expect(parseSafeUrl('http://example.com:80/')?.port).toBe('')
    expect(parseSafeUrl('https://example.com:443/')?.port).toBe('')
    expect(parseSafeUrl('HTTPS://Example.COM/a')?.hostname).toBe('example.com')
  })

  it('resolves and re-checks redirect targets against the current URL', () => {
    expect(parseSafeUrl('/next', 'https://example.com/a')?.href).toBe('https://example.com/next')
    expect(parseSafeUrl('//other.example.org/x', 'https://example.com/a')?.href).toBe('https://other.example.org/x')
    expect(parseSafeUrl('http://10.0.0.1/', 'https://example.com/a')).toBeNull()
    expect(parseSafeUrl('file:///etc/passwd', 'https://example.com/a')).toBeNull()
    expect(parseSafeUrl('javascript:alert(1)', 'https://example.com/a')).toBeNull()
  })
})
