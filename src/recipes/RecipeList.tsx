import { useEffect, useState, useSyncExternalStore } from 'react'
import { Link } from 'react-router-dom'
import { Banner, Button, Input, SectionLabel } from '@design-system/components'
import { useAuth } from '../auth/AuthContext'
import { EVERYTHING_PATH, FAVOURITES_PATH, applyFilters, justAdded, mealPath, rowLine, tileCounts } from '../lib/grouping'
import type { BackState } from '../lib/grouping'
import { MEALS, listRecipes } from '../lib/recipes'
import type { RecipeSummary } from '../lib/recipes'
import { AddButton } from './AddButton'
import { Notice } from './Notice'
import { RecipeListRow } from './RecipeListRow'
import { favourites } from './favouritesStore'

type Result = { key: string; recipes: RecipeSummary[] } | { key: string; failed: true }

const HOME_BACK: BackState = { from: { label: 'All meals', to: '/' } }
const countText = (n: number) => `${n} ${n === 1 ? 'recipe' : 'recipes'}`

const tileBase = 'flex min-h-22 flex-col justify-between rounded-lg p-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring'
const tileQuiet = tileBase + ' bg-muted text-foreground hover:bg-accent hover:text-accent-foreground'

function Tile({ to, name, count, className, children }: { to: string; name: string; count: number; className: string; children?: React.ReactNode }) {
  return (
    <Link to={to} className={className}>
      <span className="flex items-center justify-between gap-2 text-xl font-bold leading-tight">{name}{children}</span>
      <span className="text-[15px]">{countText(count)}</span>
    </Link>
  )
}

export function RecipeList() {
  const { status } = useAuth()
  const [attempt, setAttempt] = useState(0)
  const [result, setResult] = useState<Result | null>(null)
  const [searching, setSearching] = useState(false)
  const [search, setSearch] = useState('')

  // Refetch after signing back in or after a retry. The full list is loaded once; search filters it in the browser.
  const key = JSON.stringify([attempt, status === 'signed-in'])
  useEffect(() => {
    const controller = new AbortController()
    const started = favourites.mark()
    listRecipes({ time: null, meal: null, foodType: null, q: '' }, controller.signal).then(
      (recipes) => {
        // Fresh server values win over any favourite change that settled before this fetch began.
        recipes.forEach((r) => favourites.seed(r.id, started))
        setResult({ key, recipes })
      },
      () => {
        if (!controller.signal.aborted) setResult({ key, failed: true })
      },
    )
    return () => controller.abort()
  }, [key])

  useSyncExternalStore(favourites.subscribe, favourites.getVersion)

  const current = result && result.key === key ? result : null
  const recipes = current && 'recipes' in current ? current.recipes : null
  const favouriteIds = new Set(recipes ? recipes.filter((r) => favourites.get(r.id, r.favourite)).map((r) => r.id) : [])
  const counts = recipes ? tileCounts(recipes, favouriteIds) : null
  const results = recipes && searching ? applyFilters(recipes, {}, search) : null
  const newest = recipes ? justAdded(recipes, 3) : []

  function cancelSearch() {
    setSearch('')
    setSearching(false)
    document.getElementById('recipe-search')?.blur()
  }

  const statusText = results
    ? results.length === 0 ? 'No matching recipes' : countText(results.length)
    : ''

  return (
    <section className="flex flex-col gap-4" style={{ paddingBottom: 'calc(6rem + env(safe-area-inset-bottom))' }}>
      {/* No visible label: the icon and placeholder say what it does; aria-label names it. */}
      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <Input
            id="recipe-search"
            type="search"
            aria-label="Search all recipes"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onFocus={() => setSearching(true)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault()
                cancelSearch()
              }
            }}
            placeholder="Search all recipes"
            autoComplete="off"
            className={'pl-10 ' + (searching ? 'border-primary' : '')}
          />
        </div>
        {searching && (
          <button
            type="button"
            onClick={cancelSearch}
            className="inline-flex min-h-11 shrink-0 items-center rounded-lg px-2 font-semibold text-primary focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-ring"
          >
            Cancel
          </button>
        )}
      </div>

      <p role="status" aria-live="polite" aria-atomic="true" className="sr-only">{statusText}</p>

      {!current && <p className="text-muted-foreground">Loading recipes...</p>}
      {current && 'failed' in current && (
        <div className="flex flex-col items-start gap-3">
          <Banner tone="error" className="w-full">Could not load the recipes. Check your connection and try again.</Banner>
          <Button variant="secondary" onClick={() => setAttempt((n) => n + 1)}>Try again</Button>
        </div>
      )}

      {recipes && recipes.length === 0 && (
        <div className="flex flex-col items-start gap-3">
          <p className="text-lg font-semibold">No recipes saved yet</p>
          <p className="text-muted-foreground">Tap the green + button to add the first family favourite, with a link, a few notes or a photo.</p>
        </div>
      )}

      {results && recipes && recipes.length > 0 && (
        results.length === 0 ? (
          <p className="text-lg font-semibold">No matching recipes</p>
        ) : (
          <ul>
            {results.map((r) => (
              <RecipeListRow key={r.id} id={r.id} title={r.title} line={rowLine(r, 'with-meals')} backState={HOME_BACK} />
            ))}
          </ul>
        )
      )}

      {!searching && counts && recipes && recipes.length > 0 && (
        <>
          <nav aria-label="Browse recipes">
            <ul className="grid grid-cols-2 gap-3">
              <li className="col-span-2">
                <Tile to={FAVOURITES_PATH} name="Favourites" count={counts.favourites} className={tileBase + ' bg-primary text-primary-foreground hover:bg-primary/90'}>
                  <svg viewBox="0 0 24 24" className="size-6 shrink-0" aria-hidden="true" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
                  </svg>
                </Tile>
              </li>
              {MEALS.map((m) => (
                <li key={m}>
                  <Tile to={mealPath(m)} name={m} count={counts.meals[m]} className={tileQuiet + ' h-full'} />
                </li>
              ))}
              <li>
                <Tile to={EVERYTHING_PATH} name="Everything" count={counts.total} className={tileBase + ' h-full border border-input bg-background text-foreground hover:bg-accent hover:text-accent-foreground'} />
              </li>
            </ul>
          </nav>

          {newest.length > 0 && (
            <section aria-labelledby="recently-added">
              <SectionLabel id="recently-added" className="mb-1">Recently added</SectionLabel>
              <ul>
                {newest.map((r) => (
                  <RecipeListRow key={r.id} id={r.id} title={r.title} line={r.addedBy.trim()} backState={HOME_BACK} />
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      <Notice />

      <AddButton />
    </section>
  )
}
