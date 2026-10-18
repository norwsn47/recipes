import { describe, expect, it } from 'vitest'
import { nameFromFileName, nameFromUrl } from '../src/lib/names'
import { timeLabel } from '../src/lib/recipes'

describe('nameFromUrl', () => {
  it('turns a slug into a name', () => {
    expect(nameFromUrl('https://example.com/recipes/chicken-tikka-masala')).toBe('Chicken tikka masala')
    expect(nameFromUrl('https://example.com/recipes/chicken_tikka+masala.html')).toBe('Chicken tikka masala')
    expect(nameFromUrl('https://example.com/a/lemon%20drizzle%20cake/?x=1')).toBe('Lemon drizzle cake')
  })
  it('gives nothing for empty, numeric or id-like segments', () => {
    expect(nameFromUrl('https://example.com')).toBe('')
    expect(nameFromUrl('https://example.com/recipes/12345')).toBe('')
    expect(nameFromUrl('https://example.com/r/3f2b8c1d-1234-4abc-9def-0123456789ab')).toBe('')
    expect(nameFromUrl('https://example.com/r/a1b2c3d4e5f6a7')).toBe('')
    expect(nameFromUrl('https://example.com/recipes/')).toBe('')
    expect(nameFromUrl('not a url')).toBe('')
  })
  it('survives bad percent-encoding and long slugs', () => {
    expect(nameFromUrl('https://example.com/bad%E0%A4%A-pie')).toContain('pie')
    expect(nameFromUrl(`https://example.com/${'a-'.repeat(200)}`).length).toBeLessThanOrEqual(100)
  })
})

describe('nameFromFileName', () => {
  it('tidies meaningful names', () => {
    expect(nameFromFileName('chicken_pie.pdf')).toBe('Chicken pie')
    expect(nameFromFileName('nans-apple--crumble.JPG')).toBe('Nans apple crumble')
    expect(nameFromFileName('Image of cake.png')).toBe('Image of cake')
    expect(nameFromFileName('Pickled onions.jpeg')).toBe('Pickled onions')
  })
  it('leaves camera-style names empty', () => {
    for (const n of ['IMG_1234.jpg', 'DSC00012.JPG', 'PXL_20261011_123456789.jpg', 'image.png', 'Screenshot 2026-10-11 at 12.00.00.png', '20261011_123456.jpg', 'photo.heic']) {
      expect(nameFromFileName(n)).toBe('')
    }
  })
})

describe('timeLabel', () => {
  it('shows the short labels', () => {
    expect(timeLabel('Less than 30 mins')).toBe('< 30 mins')
    expect(timeLabel('Around 1 hr')).toBe('1 hr')
    expect(timeLabel('Extensive prep')).toBe('1 hr +')
  })
})
