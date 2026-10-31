import { describe, expect, it } from 'vitest'
import {
  DEFAULT_BACK, EVERYTHING_PATH, FAVOURITES_PATH, applyFilters, backTargetFromState, filtersFor, justAdded, mealFromSlug,
  mealPath, mealPlural, mealSlug, parseFilters, rowLine, tileCounts, writeFilters,
} from '../src/lib/grouping'
import type { PageKind } from '../src/lib/grouping'
import type { FoodType, Meal, RecipeSummary, TimeTag } from '../src/lib/recipes'

function recipe(id: string, over: Partial<RecipeSummary> = {}): RecipeSummary {
  return { id, title: id, timeTag: 'Less than 30 mins', meals: ['Dinner'], foodTypes: [], addedBy: 'Will', canEdit: false, createdAt: '2026-10-01T00:00:00Z', link: null, hasFiles: false, favourite: false, ...over }
}
const q = (s: string) => new URLSearchParams(s)
const meal = (m: Meal): PageKind => ({ kind: 'meal', meal: m })
const everything: PageKind = { kind: 'everything' }
const favs: PageKind = { kind: 'favourites' }

describe('meal slugs and paths', () => {
  it('round-trips every meal', () => {
    expect(mealSlug('Dinner')).toBe('dinner')
    expect(mealPath('Baking')).toBe('/meals/baking')
    expect(mealFromSlug('dinner')).toBe('Dinner')
    expect(mealFromSlug('DINNER')).toBe('Dinner')
    expect(EVERYTHING_PATH).toBe('/everything')
    expect(FAVOURITES_PATH).toBe('/favourites')
  })
  it('rejects unknown or missing slugs', () => {
    expect(mealFromSlug('supper')).toBeNull()
    expect(mealFromSlug(undefined)).toBeNull()
    expect(mealFromSlug('')).toBeNull()
  })
})

describe('tileCounts', () => {
  it('counts a multi-meal recipe in each of its meals, and once in the total', () => {
    const c = tileCounts([recipe('a', { meals: ['Dinner', 'Lunch'] }), recipe('b', { meals: ['Dinner'] })], new Set())
    expect(c.total).toBe(2)
    expect(c.meals).toEqual({ Breakfast: 0, Lunch: 1, Dinner: 2, Dessert: 0, Baking: 0 })
  })
  it('does not double count a repeated meal on one recipe', () => {
    expect(tileCounts([recipe('a', { meals: ['Dinner', 'Dinner'] })], new Set()).meals.Dinner).toBe(1)
  })
  it('counts only favourites that are in the list', () => {
    const c = tileCounts([recipe('a'), recipe('b')], new Set(['a', 'gone']))
    expect(c.favourites).toBe(1)
  })
  it('gives zeros for an empty list', () => {
    expect(tileCounts([], new Set())).toEqual({ favourites: 0, total: 0, meals: { Breakfast: 0, Lunch: 0, Dinner: 0, Dessert: 0, Baking: 0 } })
  })
})

describe('justAdded', () => {
  const list = [
    recipe('old', { createdAt: '2026-01-01T00:00:00Z' }),
    recipe('new', { createdAt: '2026-10-05T00:00:00Z' }),
    recipe('mid', { createdAt: '2026-06-01T00:00:00Z' }),
    recipe('mid2', { createdAt: '2026-07-01T00:00:00Z' }),
  ]
  it('returns the n newest, newest first', () => {
    expect(justAdded(list).map((r) => r.id)).toEqual(['new', 'mid2', 'mid'])
    expect(justAdded(list, 1).map((r) => r.id)).toEqual(['new'])
  })
  it('keeps input order on ties', () => {
    const tied = [recipe('x'), recipe('y'), recipe('z')]
    expect(justAdded(tied, 2).map((r) => r.id)).toEqual(['x', 'y'])
  })
  it('sorts unparseable dates last', () => {
    expect(justAdded([recipe('bad', { createdAt: 'nope' }), recipe('ok')], 2).map((r) => r.id)).toEqual(['ok', 'bad'])
  })
  it('does not mutate the input', () => {
    const copy = [...list]
    justAdded(list)
    expect(list).toEqual(copy)
  })
  it('copes with short lists, zero and negative n', () => {
    expect(justAdded([recipe('a')])).toHaveLength(1)
    expect(justAdded([], 3)).toEqual([])
    expect(justAdded(list, 0)).toEqual([])
    expect(justAdded(list, -2)).toEqual([])
  })
})

describe('filtersFor', () => {
  it('lists the filters each page offers, in order', () => {
    expect(filtersFor(meal('Lunch'))).toEqual(['food', 'time', 'by'])
    expect(filtersFor(everything)).toEqual(['meal', 'food', 'time', 'by'])
    expect(filtersFor(favs)).toEqual(['meal', 'time'])
  })
})

describe('parseFilters', () => {
  const people = ['Will', 'Sam']
  it('reads valid values on the Everything page', () => {
    expect(parseFilters(q('meal=Dinner&food=Chicken&time=Around+1+hr&by=Sam'), everything, people)).toEqual({ meal: 'Dinner', food: 'Chicken', time: 'Around 1 hr', by: 'Sam' })
  })
  it('ignores keys a page does not offer', () => {
    const s = q('meal=Dinner&food=Fish&time=Extensive+prep&by=Will')
    expect(parseFilters(s, meal('Lunch'), people)).toEqual({ food: 'Fish', time: 'Extensive prep', by: 'Will' })
    expect(parseFilters(s, favs, people)).toEqual({ meal: 'Dinner', time: 'Extensive prep' })
  })
  it('ignores unknown, wrong-case, empty and short-label values', () => {
    expect(parseFilters(q('meal=Supper&food=chicken&time=1+hr&by='), everything, people)).toEqual({})
    expect(parseFilters(q('meal=&food=&time='), everything, people)).toEqual({})
    expect(parseFilters(q('time=%3C+30+mins'), everything, people)).toEqual({})
  })
  it('ignores unknown keys and keeps the first of a repeated key', () => {
    expect(parseFilters(q('foo=bar&meal=Lunch&meal=Dinner'), everything, people)).toEqual({ meal: 'Lunch' })
  })
  it('ignores injection-looking values', () => {
    const bad = ["<script>alert(1)</script>", "Dinner' OR 1=1 --", 'Dinner"><img src=x>', '../../etc/passwd', 'javascript:alert(1)', 'Dinner%00']
    for (const v of bad) {
      const s = new URLSearchParams()
      s.set('meal', v); s.set('food', v); s.set('time', v); s.set('by', v)
      expect(parseFilters(s, everything, people)).toEqual({})
    }
  })
  it('validates "by" against the loaded names, exactly', () => {
    expect(parseFilters(q('by=Nobody'), everything, people)).toEqual({})
    expect(parseFilters(q('by=will'), everything, people)).toEqual({})
    expect(parseFilters(q('by=Will'), everything, [])).toEqual({})
  })
  it('keeps a plausible "by" while names are not loaded (null), but caps its length', () => {
    expect(parseFilters(q('by=Nobody'), everything, null)).toEqual({ by: 'Nobody' })
    expect(parseFilters(q(`by=${'a'.repeat(51)}`), everything, null)).toEqual({})
    expect(parseFilters(q('by=Sam'), favs, null)).toEqual({})
  })
  it('returns the list value, not a lookalike object', () => {
    expect(Object.keys(parseFilters(q('__proto__=x&constructor=y'), everything, people))).toEqual([])
  })
})

describe('writeFilters', () => {
  it('writes only set values, in a fixed order', () => {
    const out = writeFilters(q(''), { by: 'Sam', meal: 'Lunch', time: 'Around 1 hr', food: 'Beef' })
    expect(out.toString()).toBe('meal=Lunch&food=Beef&time=Around+1+hr&by=Sam')
  })
  it('gives an empty query when nothing is set', () => {
    expect(writeFilters(q('meal=Dinner'), {}).toString()).toBe('')
  })
  it('drops unrelated keys and does not mutate the input', () => {
    const current = q('meal=Dinner&x=1')
    expect(writeFilters(current, { food: 'Fish' }).toString()).toBe('food=Fish')
    expect(current.toString()).toBe('meal=Dinner&x=1')
  })
  it('round-trips through parseFilters', () => {
    const f = { meal: 'Baking' as Meal, food: 'Lamb' as FoodType, time: 'Extensive prep' as TimeTag, by: 'Sam' }
    expect(parseFilters(writeFilters(q(''), f), everything, ['Sam'])).toEqual(f)
  })
  it('encodes awkward names safely', () => {
    const out = writeFilters(q(''), { by: 'A&B=C' })
    expect(out.get('by')).toBe('A&B=C')
    expect(out.toString()).toBe('by=A%26B%3DC')
  })
})

describe('applyFilters', () => {
  const list = [
    recipe('Chicken pie', { meals: ['Dinner'], foodTypes: ['Chicken'], timeTag: 'Around 1 hr', addedBy: 'Sam' }),
    recipe('Pancakes', { meals: ['Breakfast', 'Dessert'], addedBy: 'Will' }),
    recipe('Fish pie', { meals: ['Dinner', 'Lunch'], foodTypes: ['Fish'], addedBy: 'Will' }),
    recipe('Crème brûlée', { meals: ['Dessert'], timeTag: 'Extensive prep', addedBy: 'Sam' }),
  ]
  const ids = (rs: RecipeSummary[]) => rs.map((r) => r.id)
  it('returns everything with no filters or search', () => {
    expect(ids(applyFilters(list, {}, ''))).toEqual(ids(list))
    expect(ids(applyFilters(list, {}, '   '))).toEqual(ids(list))
  })
  it('filters by each key', () => {
    expect(ids(applyFilters(list, { meal: 'Dessert' }, ''))).toEqual(['Pancakes', 'Crème brûlée'])
    expect(ids(applyFilters(list, { food: 'Fish' }, ''))).toEqual(['Fish pie'])
    expect(ids(applyFilters(list, { time: 'Extensive prep' }, ''))).toEqual(['Crème brûlée'])
    expect(ids(applyFilters(list, { by: 'Sam' }, ''))).toEqual(['Chicken pie', 'Crème brûlée'])
  })
  it('ANDs filters together', () => {
    expect(ids(applyFilters(list, { meal: 'Dinner', by: 'Will' }, ''))).toEqual(['Fish pie'])
    expect(ids(applyFilters(list, { meal: 'Dessert', food: 'Fish' }, ''))).toEqual([])
  })
  it('searches titles case-insensitively, trimmed, as substring', () => {
    expect(ids(applyFilters(list, {}, '  PIE '))).toEqual(['Chicken pie', 'Fish pie'])
    expect(ids(applyFilters(list, {}, 'CRÈME'))).toEqual(['Crème brûlée'])
  })
  it('treats wildcard characters as ordinary text', () => {
    expect(applyFilters(list, {}, '%')).toEqual([])
    expect(applyFilters(list, {}, '_')).toEqual([])
  })
  it('combines search with filters and does not mutate', () => {
    const copy = [...list]
    expect(ids(applyFilters(list, { meal: 'Dinner' }, 'fish'))).toEqual(['Fish pie'])
    expect(list).toEqual(copy)
  })
})

describe('rowLine', () => {
  const r = recipe('a', { timeTag: 'Around 1 hr', meals: ['Dinner', 'Lunch'], foodTypes: ['Chicken', 'Beef'], addedBy: 'Sam' })
  it('shows time, food types and name on meal pages', () => {
    expect(rowLine(r, 'meal-page')).toBe('1 hr · Chicken, Beef · Sam')
  })
  it('shows time, meals and name elsewhere', () => {
    expect(rowLine(r, 'with-meals')).toBe('1 hr · Dinner, Lunch · Sam')
  })
  it('uses the short time labels', () => {
    expect(rowLine(recipe('a', { timeTag: 'Less than 30 mins', addedBy: '' }), 'with-meals')).toBe('< 30 mins · Dinner')
    expect(rowLine(recipe('a', { timeTag: 'Extensive prep' }), 'with-meals')).toBe('1 hr + · Dinner · Will')
  })
  it('leaves out missing parts without stray separators', () => {
    expect(rowLine(recipe('a', { foodTypes: [] }), 'meal-page')).toBe('< 30 mins · Will')
    expect(rowLine(recipe('a', { foodTypes: [], addedBy: '  ' }), 'meal-page')).toBe('< 30 mins')
    expect(rowLine(recipe('a', { meals: [], addedBy: '' }), 'with-meals')).toBe('< 30 mins')
  })
  it('uses no em dashes', () => {
    expect(rowLine(r, 'with-meals')).not.toContain('—')
  })
})

describe('backTargetFromState', () => {
  const from = (label: unknown, to: unknown) => ({ from: { label, to } })
  it('falls back for missing or malformed state', () => {
    for (const s of [undefined, null, 'x', 5, {}, { from: null }, { from: 'x' }, { from: {} }, from(1, '/'), from('All meals', 1)]) {
      expect(backTargetFromState(s)).toEqual(DEFAULT_BACK)
    }
    expect(DEFAULT_BACK).toEqual({ label: 'All meals', to: '/' })
  })
  it('accepts each label with its own path', () => {
    expect(backTargetFromState(from('All meals', '/'))).toEqual({ label: 'All meals', to: '/' })
    expect(backTargetFromState(from('Dinner', '/meals/dinner'))).toEqual({ label: 'Dinner', to: '/meals/dinner' })
    expect(backTargetFromState(from('Favourites', '/favourites'))).toEqual({ label: 'Favourites', to: '/favourites' })
    expect(backTargetFromState(from('Everything', '/everything'))).toEqual({ label: 'Everything', to: '/everything' })
  })
  it('accepts a query string on list pages', () => {
    const to = '/meals/baking?food=Chicken&time=Around+1+hr'
    expect(backTargetFromState(from('Baking', to))).toEqual({ label: 'Baking', to })
    expect(backTargetFromState(from('Everything', '/everything?by=Sam'))).toEqual({ label: 'Everything', to: '/everything?by=Sam' })
  })
  it('rejects an unknown label or a path that does not match the label', () => {
    expect(backTargetFromState(from('Supper', '/meals/supper'))).toEqual(DEFAULT_BACK)
    expect(backTargetFromState(from('Dinner', '/meals/lunch'))).toEqual(DEFAULT_BACK)
    expect(backTargetFromState(from('Dinner', '/meals/dinnerx'))).toEqual(DEFAULT_BACK)
    expect(backTargetFromState(from('Favourites', '/everything'))).toEqual(DEFAULT_BACK)
    expect(backTargetFromState(from('All meals', '/?x=1'))).toEqual(DEFAULT_BACK)
  })
  it('rejects external, protocol-relative, scripted and fragment targets', () => {
    for (const to of ['https://evil.example/favourites', '//evil.example', '/\\evil.example', 'javascript:alert(1)', '/favourites#x', '/favourites?x=1#y', '/favourites?x=\n1', '/favourites\\?x=1']) {
      expect(backTargetFromState(from('Favourites', to))).toEqual(DEFAULT_BACK)
    }
  })
})

describe('mealPlural', () => {
  it('pluralises for "No matching ..." lines', () => {
    expect(mealPlural('Breakfast')).toBe('breakfasts')
    expect(mealPlural('Lunch')).toBe('lunches')
    expect(mealPlural('Dinner')).toBe('dinners')
    expect(mealPlural('Dessert')).toBe('desserts')
    expect(mealPlural('Baking')).toBe('baking')
  })
})
