import { afterEach, describe, expect, it, vi } from 'vitest'
import { apiFetch, onSessionEnded } from '../src/lib/api'

function mockFetch(status: number) {
  const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response('{}', { status }))
  return spy
}
afterEach(() => vi.restoreAllMocks())

describe('apiFetch', () => {
  it('adds the CSRF header to mutating methods only', async () => {
    const spy = mockFetch(200)
    await apiFetch('/api/x', { method: 'POST', json: { a: 1 } })
    await apiFetch('/api/x')
    const post = new Headers((spy.mock.calls[0][1] as RequestInit).headers)
    const get = new Headers((spy.mock.calls[1][1] as RequestInit).headers)
    expect(post.get('x-requested-with')).toBe('fetch')
    expect(post.get('content-type')).toBe('application/json')
    expect(get.get('x-requested-with')).toBeNull()
  })

  it('rejects absolute and protocol-relative URLs', async () => {
    mockFetch(200)
    await expect(apiFetch('https://evil.example/api')).rejects.toThrow()
    await expect(apiFetch('//evil.example/api')).rejects.toThrow()
  })

  it('signals session end on 401, except for calls that handle it themselves', async () => {
    mockFetch(401)
    const listener = vi.fn()
    const off = onSessionEnded(listener)
    await apiFetch('/api/auth/me', { handleUnauthorised: true })
    expect(listener).not.toHaveBeenCalled()
    await apiFetch('/api/recipes')
    expect(listener).toHaveBeenCalledTimes(1)
    off()
    await apiFetch('/api/recipes')
    expect(listener).toHaveBeenCalledTimes(1)
  })
})
