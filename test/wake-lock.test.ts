import { describe, expect, it, vi } from 'vitest'
import { createWakeLock, isWakeLockSupported } from '../src/lib/wakeLock'
import type { Sentinel } from '../src/lib/wakeLock'

function fakeSentinel(opts: { releaseThrows?: boolean } = {}) {
  let listener: (() => void) | undefined
  const s = {
    released: false,
    release: vi.fn(() => {
      if (opts.releaseThrows) throw new Error('boom')
      s.released = true
      return Promise.resolve()
    }),
    addEventListener: (_t: 'release', l: () => void) => {
      listener = l
    },
    fireRelease() {
      s.released = true
      listener?.()
    },
  }
  return s satisfies Sentinel & { fireRelease(): void }
}

function setup(visible = true) {
  const state = { visible }
  const calls: { resolve(s: Sentinel): void; reject(e: unknown): void }[] = []
  const env = {
    request: vi.fn(
      () => new Promise<Sentinel>((resolve, reject) => calls.push({ resolve, reject })),
    ),
    isVisible: () => state.visible,
    onStateChange: vi.fn(),
    onError: vi.fn(),
  }
  const lock = createWakeLock(env)
  const tick = () => new Promise((r) => setTimeout(r, 0))
  return { env, lock, state, calls, tick }
}

describe('createWakeLock', () => {
  it('requests the lock when turned on', async () => {
    const { env, lock, calls, tick } = setup()
    lock.setOn(true)
    const s = fakeSentinel()
    calls[0].resolve(s)
    await tick()
    expect(env.request).toHaveBeenCalledTimes(1)
    expect(s.release).not.toHaveBeenCalled()
    expect(env.onError).not.toHaveBeenCalled()
  })

  it('releases the lock when turned off', async () => {
    const { lock, calls, tick } = setup()
    lock.setOn(true)
    const s = fakeSentinel()
    calls[0].resolve(s)
    await tick()
    lock.setOn(false)
    expect(s.release).toHaveBeenCalledTimes(1)
  })

  it('asks again when the page becomes visible, only while on', async () => {
    const { env, lock, state, calls, tick } = setup()
    lock.setOn(true)
    const s = fakeSentinel()
    calls[0].resolve(s)
    await tick()
    state.visible = false
    s.fireRelease() // the browser lets go when hidden
    lock.onVisibilityChange()
    expect(env.request).toHaveBeenCalledTimes(1) // no request while hidden
    state.visible = true
    lock.onVisibilityChange()
    expect(env.request).toHaveBeenCalledTimes(2)
  })

  it('does not ask again when off', async () => {
    const { env, lock, calls, tick } = setup()
    lock.setOn(true)
    calls[0].resolve(fakeSentinel())
    await tick()
    lock.setOn(false)
    lock.onVisibilityChange()
    expect(env.request).toHaveBeenCalledTimes(1)
  })

  it('does not request while hidden, then does once visible', () => {
    const { env, lock, state } = setup(false)
    lock.setOn(true)
    expect(env.request).not.toHaveBeenCalled()
    state.visible = true
    lock.onVisibilityChange()
    expect(env.request).toHaveBeenCalledTimes(1)
  })

  it('does not make duplicate concurrent requests', async () => {
    const { env, lock, calls, tick } = setup()
    lock.setOn(true)
    lock.onVisibilityChange()
    lock.onVisibilityChange()
    expect(env.request).toHaveBeenCalledTimes(1)
    calls[0].resolve(fakeSentinel())
    await tick()
    lock.onVisibilityChange() // live sentinel held
    expect(env.request).toHaveBeenCalledTimes(1)
  })

  it('treats a release event as the lock being gone, but keeps the toggle on', async () => {
    const { env, lock, calls, tick } = setup()
    lock.setOn(true)
    const s = fakeSentinel()
    calls[0].resolve(s)
    await tick()
    s.fireRelease()
    expect(env.onStateChange).not.toHaveBeenCalled()
    lock.onVisibilityChange()
    expect(env.request).toHaveBeenCalledTimes(2)
  })

  it('ignores a sentinel that was already released on arrival', async () => {
    const { env, lock, calls, tick } = setup()
    lock.setOn(true)
    const s = fakeSentinel()
    s.released = true
    calls[0].resolve(s)
    await tick()
    lock.onVisibilityChange()
    expect(env.request).toHaveBeenCalledTimes(2)
  })

  it('retries when the page became visible again while a request was pending and it arrives released', async () => {
    const { env, lock, state, calls, tick } = setup()
    lock.setOn(true)
    state.visible = false
    lock.onVisibilityChange() // hidden: nothing to do
    state.visible = true
    lock.onVisibilityChange() // swallowed by the pending request
    expect(env.request).toHaveBeenCalledTimes(1)
    const stale = fakeSentinel()
    stale.released = true // the browser released it when the page was hidden
    calls[0].resolve(stale)
    await tick()
    expect(env.request).toHaveBeenCalledTimes(2)
    const live = fakeSentinel()
    calls[1].resolve(live)
    await tick()
    lock.onVisibilityChange()
    expect(env.request).toHaveBeenCalledTimes(2) // live one is held
    expect(live.release).not.toHaveBeenCalled()
    expect(env.onStateChange).not.toHaveBeenCalled()
  })

  it('does not loop on released sentinels when no visible event was swallowed', async () => {
    const { env, lock, calls, tick } = setup()
    lock.setOn(true)
    const a = fakeSentinel()
    a.released = true
    calls[0].resolve(a)
    await tick()
    expect(env.request).toHaveBeenCalledTimes(1)
  })

  it('retries at most once per swallowed visible event', async () => {
    const { env, lock, calls, tick } = setup()
    lock.setOn(true)
    lock.onVisibilityChange() // swallowed
    const a = fakeSentinel()
    a.released = true
    calls[0].resolve(a)
    await tick()
    expect(env.request).toHaveBeenCalledTimes(2)
    const b = fakeSentinel()
    b.released = true
    calls[1].resolve(b)
    await tick()
    expect(env.request).toHaveBeenCalledTimes(2) // no further retry
  })

  it('does not retry a released arrival after off or dispose', async () => {
    const a = setup()
    a.lock.setOn(true)
    a.lock.onVisibilityChange()
    a.lock.setOn(false)
    const sa = fakeSentinel()
    sa.released = true
    a.calls[0].resolve(sa)
    await a.tick()
    expect(a.env.request).toHaveBeenCalledTimes(1)

    const b = setup()
    b.lock.setOn(true)
    b.lock.onVisibilityChange()
    b.lock.dispose()
    const sb = fakeSentinel()
    sb.released = true
    b.calls[0].resolve(sb)
    await b.tick()
    expect(b.env.request).toHaveBeenCalledTimes(1)

    const c = setup() // off then on again: the old swallowed event must not carry over
    c.lock.setOn(true)
    c.lock.onVisibilityChange()
    c.lock.setOn(false)
    c.lock.setOn(true)
    const sc = fakeSentinel()
    sc.released = true
    c.calls[1].resolve(sc)
    await c.tick()
    expect(c.env.request).toHaveBeenCalledTimes(2)
  })

  it('turns the toggle off and reports once when the request fails', async () => {
    const { env, lock, calls, tick } = setup()
    lock.setOn(true)
    calls[0].reject(new Error('NotAllowedError'))
    await tick()
    expect(env.onStateChange).toHaveBeenCalledExactlyOnceWith(false)
    expect(env.onError).toHaveBeenCalledTimes(1)
    lock.onVisibilityChange()
    expect(env.request).toHaveBeenCalledTimes(1) // off now, so no retry
  })

  it('treats a request that throws synchronously as a failure', async () => {
    const { env, lock, tick } = setup()
    env.request.mockImplementationOnce(() => {
      throw new Error('sync')
    })
    lock.setOn(true)
    await tick()
    expect(env.onStateChange).toHaveBeenCalledWith(false)
    expect(env.onError).toHaveBeenCalledTimes(1)
  })

  it('reports a failed re-request after the page is visible again', async () => {
    const { env, lock, calls, tick } = setup()
    lock.setOn(true)
    const s = fakeSentinel()
    calls[0].resolve(s)
    await tick()
    s.fireRelease()
    lock.onVisibilityChange()
    calls[1].reject(new Error('nope'))
    await tick()
    expect(env.onStateChange).toHaveBeenCalledWith(false)
    expect(env.onError).toHaveBeenCalledTimes(1)
  })

  it('releases a sentinel that arrives after turning off', async () => {
    const { env, lock, calls, tick } = setup()
    lock.setOn(true)
    lock.setOn(false)
    const s = fakeSentinel()
    calls[0].resolve(s)
    await tick()
    expect(s.release).toHaveBeenCalledTimes(1)
    expect(env.onStateChange).not.toHaveBeenCalled()
  })

  it('releases a sentinel that arrives after dispose', async () => {
    const { lock, calls, tick } = setup()
    lock.setOn(true)
    lock.dispose()
    const s = fakeSentinel()
    calls[0].resolve(s)
    await tick()
    expect(s.release).toHaveBeenCalledTimes(1)
  })

  it('ignores a stale rejection after off or dispose', async () => {
    const a = setup()
    a.lock.setOn(true)
    a.lock.setOn(false)
    a.calls[0].reject(new Error('late'))
    await a.tick()
    expect(a.env.onStateChange).not.toHaveBeenCalled()
    expect(a.env.onError).not.toHaveBeenCalled()

    const b = setup()
    b.lock.setOn(true)
    b.lock.dispose()
    b.calls[0].reject(new Error('late'))
    await b.tick()
    expect(b.env.onStateChange).not.toHaveBeenCalled()
    expect(b.env.onError).not.toHaveBeenCalled()
  })

  it('ends with exactly one held sentinel after rapid on, off, on', async () => {
    const { env, lock, calls, tick } = setup()
    lock.setOn(true)
    lock.setOn(false)
    lock.setOn(true)
    expect(env.request).toHaveBeenCalledTimes(2)
    const first = fakeSentinel()
    const second = fakeSentinel()
    calls[1].resolve(second)
    calls[0].resolve(first)
    await tick()
    expect(first.release).toHaveBeenCalledTimes(1)
    expect(second.release).not.toHaveBeenCalled()
    lock.onVisibilityChange()
    expect(env.request).toHaveBeenCalledTimes(2) // second is held
  })

  it('swallows a release that throws', async () => {
    const { lock, calls, tick } = setup()
    lock.setOn(true)
    const s = fakeSentinel({ releaseThrows: true })
    calls[0].resolve(s)
    await tick()
    expect(() => lock.setOn(false)).not.toThrow()
    expect(s.release).toHaveBeenCalledTimes(1)
  })

  it('swallows a release that rejects, and a missing release', async () => {
    const { lock, calls, tick } = setup()
    lock.setOn(true)
    const s = fakeSentinel()
    s.release.mockImplementation(() => Promise.reject(new Error('no')))
    calls[0].resolve(s)
    await tick()
    expect(() => lock.dispose()).not.toThrow()
    await tick()

    const b = setup()
    b.lock.setOn(true)
    b.calls[0].resolve({ addEventListener: () => {} })
    await b.tick()
    expect(() => b.lock.setOn(false)).not.toThrow()
  })

  it('releases on dispose, and dispose is idempotent', async () => {
    const { env, lock, calls, tick } = setup()
    lock.setOn(true)
    const s = fakeSentinel()
    calls[0].resolve(s)
    await tick()
    lock.dispose()
    lock.dispose()
    expect(s.release).toHaveBeenCalledTimes(1)
    lock.setOn(true)
    lock.onVisibilityChange()
    expect(env.request).toHaveBeenCalledTimes(1)
  })

  it('a release we caused does not trigger anything', async () => {
    const { env, lock, calls, tick } = setup()
    lock.setOn(true)
    const s = fakeSentinel()
    calls[0].resolve(s)
    await tick()
    lock.setOn(false)
    s.fireRelease()
    lock.onVisibilityChange()
    expect(env.request).toHaveBeenCalledTimes(1)
    expect(env.onStateChange).not.toHaveBeenCalled()
  })
})

describe('createWakeLock: device lets go while the page is visible', () => {
  it('asks again once, and stays on if that works', async () => {
    const { env, lock, calls, tick } = setup()
    lock.setOn(true)
    const s1 = fakeSentinel()
    calls[0].resolve(s1)
    await tick()
    s1.fireRelease() // e.g. Low Power Mode, page still visible
    expect(env.request).toHaveBeenCalledTimes(2)
    calls[1].resolve(fakeSentinel())
    await tick()
    expect(env.onStateChange).not.toHaveBeenCalled()
    expect(env.onError).not.toHaveBeenCalled()
  })

  it('turns off with one error if it lets go again while still visible', async () => {
    const { env, lock, calls, tick } = setup()
    lock.setOn(true)
    const s1 = fakeSentinel()
    calls[0].resolve(s1)
    await tick()
    s1.fireRelease()
    const s2 = fakeSentinel()
    calls[1].resolve(s2)
    await tick()
    s2.fireRelease()
    expect(env.request).toHaveBeenCalledTimes(2) // no loop
    expect(env.onStateChange).toHaveBeenCalledWith(false)
    expect(env.onError).toHaveBeenCalledTimes(1)
  })

  it('turns off with one error if the retry request fails', async () => {
    const { env, lock, calls, tick } = setup()
    lock.setOn(true)
    const s1 = fakeSentinel()
    calls[0].resolve(s1)
    await tick()
    s1.fireRelease()
    calls[1].reject(new Error('NotAllowedError'))
    await tick()
    expect(env.onStateChange).toHaveBeenCalledWith(false)
    expect(env.onError).toHaveBeenCalledTimes(1)
  })

  it('gets a fresh retry after a hide and show cycle', async () => {
    const { env, lock, state, calls, tick } = setup()
    lock.setOn(true)
    const s1 = fakeSentinel()
    calls[0].resolve(s1)
    await tick()
    s1.fireRelease() // visible release: uses the one retry
    const s2 = fakeSentinel()
    calls[1].resolve(s2)
    await tick()
    state.visible = false
    s2.fireRelease()
    lock.onVisibilityChange()
    state.visible = true
    lock.onVisibilityChange()
    const s3 = fakeSentinel()
    calls[2].resolve(s3)
    await tick()
    s3.fireRelease() // visible release again: retry allowed afresh
    expect(env.request).toHaveBeenCalledTimes(4)
    expect(env.onError).not.toHaveBeenCalled()
  })

  it('does nothing when it lets go after being switched off', async () => {
    const { env, lock, calls, tick } = setup()
    lock.setOn(true)
    const s1 = fakeSentinel()
    calls[0].resolve(s1)
    await tick()
    lock.setOn(false)
    s1.fireRelease()
    expect(env.request).toHaveBeenCalledTimes(1)
    expect(env.onError).not.toHaveBeenCalled()
  })
})

describe('isWakeLockSupported', () => {
  it('is false without wakeLock or without a navigator', () => {
    expect(isWakeLockSupported({})).toBe(false)
    expect(isWakeLockSupported(undefined)).toBe(false)
  })
  it('is true with wakeLock', () => {
    expect(isWakeLockSupported({ wakeLock: {} })).toBe(true)
  })
})
