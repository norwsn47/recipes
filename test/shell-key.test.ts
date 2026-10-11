import { describe, expect, it } from 'vitest'
import { shellKey } from '../src/auth/shellKey'

describe('shellKey', () => {
  it('is stable for the same user, so re-signing in keeps the tree mounted', () => {
    expect(shellKey({ id: 'u1' })).toBe(shellKey({ id: 'u1' }))
  })
  it('changes for a different user, so the tree remounts and old form state is dropped', () => {
    expect(shellKey({ id: 'u1' })).not.toBe(shellKey({ id: 'u2' }))
  })
})
