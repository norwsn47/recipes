import { describe, expect, it } from 'vitest'
import { hasVisibleNotes, isHtmlNotes, legacyPlainToHtml, normaliseEditorNotes, notesVisibleLength, notesVisibleText } from '../src/lib/notes'
import { MAX_NOTES, MAX_NOTES_RAW, validateRecipe } from '../src/lib/recipes'
import type { RecipeInput } from '../src/lib/recipes'
import { isHtmlNotes as serverIsHtml, notesVisibleLength as serverLength } from '../worker/recipe-validation'

const base: RecipeInput = { title: 'Soup', timeTag: 'Around 1 hr', meals: ['Dinner'], foodTypes: [], link: '', notes: '' }

describe('isHtmlNotes', () => {
  it('is true only when the trimmed text starts with <p>, <ul> or <ol>', () => {
    expect(isHtmlNotes('<p>Hi</p>')).toBe(true)
    expect(isHtmlNotes('  <ul><li><p>a</p></li></ul>  ')).toBe(true)
    expect(isHtmlNotes('<ol><li><p>a</p></li></ol>')).toBe(true)
  })
  it('treats everything else as plain text', () => {
    for (const t of ['<3 this', '< 30 mins', 'a <p>b</p>', '<strong>x</strong>', '<p class="x">y</p>', '', 'Plain']) {
      expect(isHtmlNotes(t)).toBe(false)
    }
  })
  it('agrees with the server', () => {
    for (const t of ['<p>Hi</p>', '<3', ' <ol>', 'x', '<pre>', '<ul >']) expect(isHtmlNotes(t)).toBe(serverIsHtml(t))
  })
})

describe('legacyPlainToHtml', () => {
  it('escapes &, < and > and keeps all the text', () => {
    expect(legacyPlainToHtml('I <3 this')).toBe('<p>I &lt;3 this</p>')
    expect(legacyPlainToHtml('< 30 mins')).toBe('<p>&lt; 30 mins</p>')
    expect(legacyPlainToHtml('a & b')).toBe('<p>a &amp; b</p>')
    expect(legacyPlainToHtml('<p>not markup</p>'.replace('<p>', ' <b>'))).toBe('<p> &lt;b&gt;not markup&lt;/p&gt;</p>')
  })
  it('makes every non-empty line its own paragraph, whatever the line endings', () => {
    expect(legacyPlainToHtml('one\ntwo\r\nthree\rfour')).toBe('<p>one</p><p>two</p><p>three</p><p>four</p>')
  })
  it('drops blank lines as separators and returns nothing for blank text', () => {
    expect(legacyPlainToHtml('one\n\n\n  \ntwo')).toBe('<p>one</p><p>two</p>')
    expect(legacyPlainToHtml('  \n\n')).toBe('')
  })
  it('round-trips the visible text of a note without losing any characters', () => {
    const text = 'Mix 2 & 3 <eggs>\nBake at 180C > 20 mins\n\nI <3 it'
    const html = legacyPlainToHtml(text)
    expect(notesVisibleText(html)).toBe(text.split('\n').filter((l) => l.trim()).join(''))
  })
  it('leaves rich text alone', () => {
    expect(legacyPlainToHtml('<p>Hi</p>')).toBe('<p>Hi</p>')
  })
})

describe('visible length', () => {
  it('counts text only, decoding entities and adding nothing between blocks', () => {
    expect(notesVisibleLength('<p>ab</p><p>cd</p>')).toBe(4)
    expect(notesVisibleLength('<p>a &amp; b &lt;3</p>')).toBe(8)
    expect(notesVisibleLength('<ul><li><p><strong>Hi</strong> there</p></li></ul>')).toBe(8)
    expect(notesVisibleLength('<p>a<br>b</p>')).toBe(2)
  })
  it('counts plain text as it is, trimmed', () => {
    expect(notesVisibleLength('  I <3 it \n')).toBe(7)
    expect(notesVisibleLength('< 30 mins')).toBe(9)
  })
  it('matches the server', () => {
    for (const t of ['<p>a &amp; b &lt;3 &quot;x&quot; &#39;y&#39;</p>', '<ol><li><p>one</p><ul><li><p>two</p></li></ul></li></ol>', 'plain <3']) {
      expect(notesVisibleLength(t)).toBe(serverLength(t))
    }
  })
  it('knows when there is nothing to read', () => {
    expect(hasVisibleNotes('<p></p>')).toBe(false)
    expect(hasVisibleNotes('<p> </p><ul><li><p></p></li></ul>')).toBe(false)
    expect(hasVisibleNotes('<p>x</p>')).toBe(true)
    expect(normaliseEditorNotes('<p></p>')).toBe('')
    expect(normaliseEditorNotes(' <p>x</p> ')).toBe('<p>x</p>')
  })
})

describe('validateRecipe notes', () => {
  const withNotes = (notes: string, extra: Partial<RecipeInput> = {}, files = 0) => validateRecipe({ ...base, notes, ...extra }, files)

  it('treats an empty editor as no notes for the content rule', () => {
    expect(withNotes('<p></p>').content).toBeDefined()
    expect(withNotes('<p></p>', { link: 'https://example.com' }).content).toBeUndefined()
    expect(withNotes('<p></p>', {}, 1).content).toBeUndefined()
    expect(withNotes('<p>Boil it</p>').content).toBeUndefined()
  })
  it('counts visible text, not markup, against the 2,000 limit', () => {
    const ok = `<p>${'a'.repeat(MAX_NOTES)}</p>`
    const tooLong = `<p>${'a'.repeat(MAX_NOTES + 1)}</p>`
    expect(withNotes(ok).notes).toBeUndefined()
    expect(withNotes(tooLong).notes).toMatch(/2,000/)
    const manyParagraphs = `${'<p>a</p>'.repeat(1000)}`
    expect(manyParagraphs.length).toBeLessThanOrEqual(MAX_NOTES_RAW)
    expect(withNotes(manyParagraphs).notes).toBeUndefined()
  })
  it('caps the stored markup', () => {
    const heavy = '<p>a</p>'.repeat(MAX_NOTES_RAW / 8 + 1)
    expect(heavy.length).toBeGreaterThan(MAX_NOTES_RAW)
    expect(withNotes(heavy).notes).toMatch(/too much formatting/)
    expect(withNotes('<p>a</p>'.repeat(MAX_NOTES_RAW / 8)).notes).toBeUndefined()
  })
  it('still accepts legacy plain text, counting it as typed', () => {
    expect(withNotes('I <3 this').notes).toBeUndefined()
    expect(withNotes('a'.repeat(MAX_NOTES)).notes).toBeUndefined()
    expect(withNotes('a'.repeat(MAX_NOTES + 1)).notes).toBeDefined()
  })
})
