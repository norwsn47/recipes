import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'
import { useLocation, useParams, useSearchParams } from 'react-router-dom'
import { Banner, Button, Input } from '@design-system/components'
import { useAuth } from '../auth/AuthContext'
import { applyFilters, filtersFor, mealFromSlug, mealPath, mealPlural, parseFilters, rowLine, writeFilters, EVERYTHING_PATH, FAVOURITES_PATH } from '../lib/grouping'
import type { BackState, FilterKey, Filters, PageKind } from '../lib/grouping'
import { FOOD_TYPES, MEALS, TIME_TAGS, listRecipes, timeLabel } from '../lib/recipes'
import type { RecipeSummary, TimeTag } from '../lib/recipes'
import { BackLink } from './BackLink'
import { FavouriteButton } from './FavouriteButton'
import { AddButton } from './AddButton'
import { FilterDropdown } from './FilterDropdown'
import { Notice } from './Notice'
import { RecipeListRow } from './RecipeListRow'
import { favourites } from './favouritesStore'

/** `favouriteIds` is fixed per fetch, so un-hearting on the Favourites page keeps the row until the next refetch (product rule). */
type Result = { key: string; recipes: RecipeSummary[]; favouriteIds: ReadonlySet<string> } | { key: string; failed: true }

const countText = (n: number) => `${n} ${n === 1 ? 'recipe' : 'recipes'}`
const FILTER_LABEL: Record<FilterKey, string> = { meal: 'Meal', food: 'Food type', time: 'Time', by: 'Added by' }

/** The list pages: /meals/:meal, /everything and /favourites. Remounted per page so search and filter lists reset. */
export function ListPage({ kind }: { kind: 'meal' | 'everything' | 'favourites' }) {
  const { meal: slug } = useParams()
  const meal = kind === 'meal' ? mealFromSlug(slug) : null
  if (kind === 'meal' && !meal) {
    return (
      <section className="flex flex-col items-start gap-3 py-4">
        <h2 className="text-2xl">We could not find that meal</h2>
        <p className="text-muted-foreground">The link may not be quite right. Head back to see all the meals.</p>
        <BackLink>All meals</BackLink>
      </section>
    )
  }
  const page: PageKind = kind === 'meal' && meal ? { kind: 'meal', meal } : kind === 'favourites' ? { kind: 'favourites' } : { kind: 'everything' }
  return <ListPageBody key={kind + (meal ?? '')} page={page} />
}

function ListPageBody({ page }: { page: PageKind }) {
  const { status } = useAuth()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const [attempt, setAttempt] = useState(0)
  const [result, setResult] = useState<Result | null>(null)
  const [searching, setSearching] = useState(false)
  const [search, setSearch] = useState('')
  const searchButton = useRef<HTMLButtonElement>(null)

  const pageMeal = page.kind === 'meal' ? page.meal : null
  const heading = page.kind === 'meal' ? page.meal : page.kind === 'favourites' ? 'Favourites' : 'Everything'
  const basePath = page.kind === 'meal' ? mealPath(page.meal) : page.kind === 'favourites' ? FAVOURITES_PATH : EVERYTHING_PATH

  // The full list is loaded once (and again after signing back in or a retry); filtering happens in the browser.
  const key = JSON.stringify([attempt, status === 'signed-in'])
  useEffect(() => {
    const controller = new AbortController()
    const started = favourites.mark()
    listRecipes({ time: null, meal: null, foodType: null, q: '' }, controller.signal).then(
      (recipes) => {
        // Fresh server values win over any favourite change that settled before this fetch began.
        recipes.forEach((r) => favourites.seed(r.id, started))
        const favouriteIds = new Set(recipes.filter((r) => favourites.get(r.id, r.favourite)).map((r) => r.id))
        setResult({ key, recipes, favouriteIds })
      },
      () => {
        if (!controller.signal.aborted) setResult({ key, failed: true })
      },
    )
    return () => controller.abort()
  }, [key])

  useSyncExternalStore(favourites.subscribe, favourites.getVersion)

  const current = result && result.key === key ? result : null
  const loaded = current && 'recipes' in current ? current : null

  // The set this page is about, before filters: one meal, the hearted recipes, or everything.
  const base = loaded
    ? loaded.recipes.filter((r) => (pageMeal ? r.meals.includes(pageMeal) : page.kind === 'favourites' ? loaded.favouriteIds.has(r.id) : true))
    : null
  const names = base ? [...new Set(base.map((r) => r.addedBy.trim()).filter((n) => n))].sort((a, b) => a.localeCompare(b)) : null
  // Parsed again once the names load, so a name nobody has is dropped.
  const filters = parseFilters(searchParams, page, names)
  const filtersOn = Object.keys(filters).length
  const results = base ? applyFilters(base, pageMeal ? { ...filters, meal: pageMeal } : filters, search) : null

  function setFilter(filterKey: FilterKey, value: string | undefined) {
    const next: Record<string, string | undefined> = { ...filters }
    if (value === undefined) delete next[filterKey]
    else next[filterKey] = value
    setSearchParams(writeFilters(searchParams, next as Filters), { replace: true })
  }
  function clearFilters() {
    setSearchParams(writeFilters(searchParams, {}), { replace: true })
  }
  function openSearch() {
    setSearching(true)
  }
  function cancelSearch() {
    setSearch('')
    setSearching(false)
    searchButton.current?.focus()
  }
  useEffect(() => {
    if (searching) document.getElementById('list-search')?.focus()
  }, [searching])

  const backState: BackState = { from: { label: pageMeal ?? (page.kind === 'favourites' ? 'Favourites' : 'Everything'), to: basePath + location.search } }
  const rowMode = pageMeal ? 'meal-page' : 'with-meals'
  const noun = pageMeal ? mealPlural(pageMeal) : 'recipes'

  const statusText = results ? (results.length === 0 ? `No matching ${noun}` : countText(results.length)) : ''

  function optionsFor(filterKey: FilterKey): { value: string; label: string }[] {
    switch (filterKey) {
      case 'meal': return MEALS.map((m) => ({ value: m, label: m }))
      case 'food': return FOOD_TYPES.map((f) => ({ value: f, label: f }))
      case 'time': return TIME_TAGS.map((t) => ({ value: t, label: timeLabel(t) }))
      case 'by': return (names ?? []).map((n) => ({ value: n, label: n }))
    }
  }
  const shownValue = (filterKey: FilterKey): string | undefined => {
    const v = filters[filterKey]
    return v && filterKey === 'time' ? timeLabel(v as TimeTag) : v
  }

  const filterKeys = filtersFor(page).filter((k) => k !== 'by' || (names && names.length > 0))

  return (
    <section className="flex flex-col gap-3" style={{ paddingBottom: 'calc(6rem + env(safe-area-inset-bottom))' }}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="min-w-0 text-3xl [overflow-wrap:anywhere]">{heading}</h2>
        {results && <p className="shrink-0 text-muted-foreground">{countText(results.length)}</p>}
      </div>

      {base && base.length > 0 && (
        <>
          <div className="-mx-4 flex items-center">
            <div role="group" aria-label="Search and filters" className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto py-2 pl-4 pr-2 [&>*]:shrink-0 [&>*]:whitespace-nowrap">
              <button
                ref={searchButton}
                type="button"
                aria-label="Search"
                aria-expanded={searching}
                onClick={() => (searching ? cancelSearch() : openSearch())}
                className={'inline-flex size-11 items-center justify-center rounded-full border outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ' + (searching ? 'border-primary bg-accent text-accent-foreground' : 'border-input bg-background text-foreground hover:bg-accent')}
              >
                <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="7" />
                  <path d="m20 20-3.5-3.5" />
                </svg>
              </button>
              {filterKeys.map((k) => (
                <FilterDropdown key={k} label={FILTER_LABEL[k]} value={filters[k]} shownValue={shownValue(k)} options={optionsFor(k)} onChange={(v) => setFilter(k, v)} />
              ))}
            </div>
            {filtersOn > 0 && (
              <button
                type="button"
                onClick={clearFilters}
                className="mr-4 inline-flex min-h-11 shrink-0 items-center rounded-lg px-2 font-semibold text-primary focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-ring"
              >
                Clear
              </button>
            )}
          </div>

          {searching && (
            <div className="flex items-center gap-2">
              <div className="relative min-w-0 flex-1">
                <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                  <circle cx="11" cy="11" r="7" />
                  <path d="m20 20-3.5-3.5" />
                </svg>
                <Input
                  id="list-search"
                  type="search"
                  aria-label={`Search ${heading.toLowerCase()}`}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      e.preventDefault()
                      cancelSearch()
                    }
                  }}
                  placeholder={`Search ${heading.toLowerCase()}`}
                  autoComplete="off"
                  className="pl-10"
                />
              </div>
              <button
                type="button"
                onClick={cancelSearch}
                className="inline-flex min-h-11 shrink-0 items-center rounded-lg px-2 font-semibold text-primary focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-ring"
              >
                Cancel
              </button>
            </div>
          )}
        </>
      )}

      <p role="status" aria-live="polite" aria-atomic="true" className="sr-only">{statusText}</p>

      {!current && <p className="text-muted-foreground">Loading recipes...</p>}
      {current && 'failed' in current && (
        <div className="flex flex-col items-start gap-3">
          <Banner tone="error" className="w-full">Could not load the recipes. Check your connection and try again.</Banner>
          <Button variant="secondary" onClick={() => setAttempt((n) => n + 1)}>Try again</Button>
        </div>
      )}

      {base && base.length === 0 && <EmptyBase page={page} />}

      {base && base.length > 0 && results && (
        results.length === 0 ? (
          <div className="flex flex-col items-start gap-3">
            <p className="text-lg font-semibold">No matching {noun}</p>
            <Button variant="secondary" onClick={() => { clearFilters(); setSearch(''); setSearching(false) }}>Clear filters</Button>
          </div>
        ) : (
          <ul>
            {results.map((r) => (
              <RecipeListRow
                key={r.id}
                id={r.id}
                title={r.title}
                line={rowLine(r, rowMode)}
                backState={backState}
                trailing={<FavouriteButton recipeId={r.id} favourite={r.favourite} />}
              />
            ))}
          </ul>
        )
      )}

      <Notice />

      <AddButton meal={pageMeal} />
    </section>
  )
}

function EmptyBase({ page }: { page: PageKind }): ReactNode {
  if (page.kind === 'favourites') {
    return (
      <div className="flex flex-col items-start gap-1">
        <p className="text-lg font-semibold">No favourites yet</p>
        <p className="text-muted-foreground">Tap the <span aria-hidden="true">♡</span><span className="sr-only">heart</span> on a recipe to keep it here.</p>
      </div>
    )
  }
  const what = page.kind === 'meal' ? mealPlural(page.meal) : 'recipes'
  return (
    <div className="flex flex-col items-start gap-1">
      <p className="text-lg font-semibold">{page.kind === 'meal' ? `No ${what} yet` : 'No recipes saved yet'}</p>
      <p className="text-muted-foreground">Add one with the green + button.</p>
    </div>
  )
}
