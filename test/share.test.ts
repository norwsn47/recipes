import { describe, expect, it, vi } from 'vitest'
import { createNoticeStore } from '../src/lib/notice'
import { LINK_COPIED, shareRecipe, shareUrl } from '../src/lib/share'
import type { ShareEnv } from '../src/lib/share'

const recipe = { id: 'abc123', title: 'Lemon cake' }
const URL_ = 'https://recipes.example/r/abc123'

function setup(nav: ShareEnv['nav']) {
  const notice = createNoticeStore()
  const env: ShareEnv = { origin: 'https://recipes.example', nav, notice }
  return { env, notice }
}
const abort = () => Object.assign(new Error('cancelled'), { name: 'AbortError' })

describe('shareRecipe', () => {
  it('builds the link from the origin and /r/:id', () => {
    expect(shareUrl('https://recipes.example', 'abc123')).toBe(URL_)
  })

  it('uses the native share sheet and shows nothing', async () => {
    const share = vi.fn().mockResolvedValue(undefined)
    const writeText = vi.fn()
    const { env, notice } = setup({ share, clipboard: { writeText } })
    await shareRecipe(recipe, env)
    expect(share).toHaveBeenCalledWith({ title: 'Lemon cake', url: URL_ })
    expect(writeText).not.toHaveBeenCalled()
    expect(notice.get().message).toBe('')
  })

  it('does nothing when the user cancels the share sheet', async () => {
    const writeText = vi.fn()
    const { env, notice } = setup({ share: vi.fn().mockRejectedValue(abort()), clipboard: { writeText } })
    await shareRecipe(recipe, env)
    expect(writeText).not.toHaveBeenCalled()
    expect(notice.get().message).toBe('')
  })

  it('copies the link when sharing fails for another reason', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    const { env, notice } = setup({ share: vi.fn().mockRejectedValue(new Error('NotAllowedError')), clipboard: { writeText } })
    await shareRecipe(recipe, env)
    expect(writeText).toHaveBeenCalledWith(URL_)
    expect(notice.get()).toEqual({ message: LINK_COPIED, persist: false, source: '' })
  })

  it('copies the link when sharing is unavailable', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    const { env, notice } = setup({ clipboard: { writeText } })
    await shareRecipe(recipe, env)
    expect(writeText).toHaveBeenCalledWith(URL_)
    expect(notice.get().message).toBe(LINK_COPIED)
  })

  it('shows the link to copy by hand when the clipboard rejects', async () => {
    const { env, notice } = setup({ clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) } })
    await shareRecipe(recipe, env)
    expect(notice.get().message).toContain(URL_)
    expect(notice.get().persist).toBe(true)
  })

  it('shows the link to copy by hand when there is no clipboard at all', async () => {
    const { env, notice } = setup(undefined)
    await shareRecipe(recipe, env)
    expect(notice.get().message).toBe(`Copy this link: ${URL_}`)
  })
})

describe('notice store', () => {
  it('shows one message at a time and a new one replaces the old', () => {
    const n = createNoticeStore()
    const seen = vi.fn()
    n.subscribe(seen)
    n.show('one', { persist: true })
    n.show('two')
    expect(n.get()).toEqual({ message: 'two', persist: false, source: '' })
    n.clear()
    expect(n.get().message).toBe('')
    expect(seen).toHaveBeenCalledTimes(3)
  })
})

describe('notice ownership and page changes', () => {
  it('a favourites clear leaves a persistent share notice alone', () => {
    const n = createNoticeStore()
    n.show('Copy this link: https://x', { persist: true })
    n.clear('favourites')
    expect(n.get().message).toBe('Copy this link: https://x')
  })

  it('favourites can clear its own message, and a failure replaces a share notice', () => {
    const n = createNoticeStore()
    n.show('Copy this link: https://x', { persist: true })
    n.show('Could not update your favourites. Try again.', { source: 'favourites' })
    expect(n.get().persist).toBe(false)
    n.clear('favourites')
    expect(n.get().message).toBe('')
  })

  it('clearIf clears the message that was showing, persistent or not', () => {
    const n = createNoticeStore()
    n.show('Copy this link: https://x', { persist: true })
    n.clearIf(n.get())
    expect(n.get().message).toBe('')
  })

  it('clearIf leaves a newer message alone', () => {
    const n = createNoticeStore()
    n.show('first')
    const old = n.get()
    n.show('second')
    n.clearIf(old)
    expect(n.get().message).toBe('second')
  })
})
