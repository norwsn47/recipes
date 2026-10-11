import { exports } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'

describe('worker /api routes', () => {
  it('GET /api/health returns 200 {"ok":true}', async () => {
    const res = await exports.default.fetch('http://example.com/api/health')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
  })

  it('POST /api/health returns 405', async () => {
    const res = await exports.default.fetch('http://example.com/api/health', { method: 'POST' })
    expect(res.status).toBe(405)
  })

  it('unknown /api path returns a JSON 404', async () => {
    const res = await exports.default.fetch('http://example.com/api/nope')
    expect(res.status).toBe(404)
    expect(res.headers.get('content-type')).toContain('application/json')
    expect(await res.json()).toEqual({ error: { code: 'not_found', message: 'Not found' } })
  })
})
