import { describe, expect, it } from 'vitest'
import { createFavouritesStore } from '../src/lib/favourites'

function setup() {
  const calls: { id: string; on: boolean; resolve(v: boolean): void; reject(e: unknown): void }[] = []
  const store = createFavouritesStore({
    send: (id, on) => new Promise<boolean>((resolve, reject) => calls.push({ id, on, resolve, reject })),
    messageFor: (e) => (e === 'quiet' ? null : 'failed'),
  })
  return { store, calls }
}
const flush = () => new Promise((r) => setTimeout(r, 0))

describe('favourites store', () => {
  it('flips at once and settles on the confirmed state', async () => {
    const { store, calls } = setup()
    store.toggle('a', false)
    expect(store.get('a', false)).toBe(true)
    calls[0].resolve(true)
    await flush()
    expect(store.get('a', false)).toBe(true)
    expect(calls).toHaveLength(1)
  })

  it('reverts and sets a message on failure', async () => {
    const { store, calls } = setup()
    store.toggle('a', true)
    expect(store.get('a', true)).toBe(false)
    calls[0].reject(new Error('x'))
    await flush()
    expect(store.get('a', true)).toBe(true)
    expect(store.getNotice()).toBe('failed')
  })

  it('shows no message when the error maps to null', async () => {
    const { store, calls } = setup()
    store.toggle('a', false)
    calls[0].reject('quiet')
    await flush()
    expect(store.get('a', false)).toBe(false)
    expect(store.getNotice()).toBe('')
  })

  it('rapid taps end on the last tap with one follow-up request', async () => {
    const { store, calls } = setup()
    store.toggle('a', false) // on
    store.toggle('a', false) // off (shown was true)
    store.toggle('a', false) // on
    expect(store.get('a', false)).toBe(true)
    expect(calls).toHaveLength(1)
    calls[0].resolve(true)
    await flush()
    expect(calls).toHaveLength(1)
    expect(store.get('a', false)).toBe(true)
  })

  it('sends a follow-up when the last tap differs, and reverts to the last confirmed state if it fails', async () => {
    const { store, calls } = setup()
    store.toggle('a', false) // on
    store.toggle('a', false) // off
    calls[0].resolve(true)
    await flush()
    expect(calls).toHaveLength(2)
    expect(calls[1].on).toBe(false)
    expect(store.get('a', false)).toBe(false)
    calls[1].reject(new Error('x'))
    await flush()
    expect(store.get('a', false)).toBe(true)
  })

  it('lets a newer fetch win over a settled change, but not an older one', async () => {
    const { store, calls } = setup()
    const before = store.mark()
    store.toggle('a', false)
    calls[0].resolve(true)
    await flush()
    store.seed('a', before)
    expect(store.get('a', false)).toBe(true)
    store.seed('a', store.mark())
    expect(store.get('a', false)).toBe(false)
  })

  it('ignores a request that settles after a reset: no write, no follow-up, no notice', async () => {
    const { store, calls } = setup()
    store.toggle('a', false)
    store.toggle('a', false) // wants off, so a follow-up would be sent on settle
    store.reset()
    calls[0].resolve(true)
    await flush()
    expect(calls).toHaveLength(1)
    expect(store.get('a', false)).toBe(false)

    store.toggle('b', true)
    store.reset()
    calls[1].reject(new Error('x'))
    await flush()
    expect(store.getNotice()).toBe('')
    expect(store.get('b', true)).toBe(true)
  })

  it('reset clears entries and the notice and bumps the version', async () => {
    const { store, calls } = setup()
    store.toggle('a', true)
    calls[0].reject(new Error('x'))
    await flush()
    expect(store.getNotice()).toBe('failed')
    store.toggle('c', false)
    expect(store.get('c', false)).toBe(true)
    const v = store.getVersion()
    store.reset()
    expect(store.getNotice()).toBe('')
    expect(store.get('c', false)).toBe(false)
    expect(store.getVersion()).toBeGreaterThan(v)
  })
})
