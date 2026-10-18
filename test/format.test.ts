import { describe, expect, it } from 'vitest'
import { firstName, linkHostname, shortDate } from '../src/lib/format'

describe('linkHostname', () => {
  it('gives the domain without www', () => {
    expect(linkHostname('https://www.example.com/recipes/pasta?x=1')).toBe('example.com')
    expect(linkHostname('http://cooking.example.co.uk/a')).toBe('cooking.example.co.uk')
  })
  it('gives nothing for anything that is not http or https', () => {
    expect(linkHostname('javascript:alert(1)')).toBeNull()
    expect(linkHostname('ftp://example.com')).toBeNull()
  })
  it('gives nothing for an invalid URL', () => {
    expect(linkHostname('not a url')).toBeNull()
    expect(linkHostname('')).toBeNull()
  })
})

describe('firstName', () => {
  it('takes the first word', () => {
    expect(firstName('Will Griffiths')).toBe('Will')
    expect(firstName('  Sam  ')).toBe('Sam')
  })
  it('falls back to the whole value when empty', () => {
    expect(firstName('')).toBe('')
  })
})

describe('shortDate', () => {
  it('omits the year for this year', () => {
    const now = new Date()
    now.setMonth(9, 18)
    expect(shortDate(now.toISOString())).toBe('18 Oct')
  })
  it('adds the year for other years', () => {
    expect(shortDate('2001-03-05T12:00:00Z')).toBe('5 Mar 2001')
  })
  it('gives nothing for an invalid date', () => {
    expect(shortDate('nope')).toBe('')
  })
})
