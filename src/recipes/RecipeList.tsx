import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Badge, Banner, Button, Card, Input, SectionLabel } from '@design-system/components'
import { useAuth } from '../auth/AuthContext'
import { CATEGORIES, TIME_TAGS, formatDate, listRecipes, timeLabel } from '../lib/recipes'
import type { Category, RecipeSummary, TimeTag } from '../lib/recipes'
import { FavouriteButton } from './FavouriteButton'
import { FavouriteNotice } from './FavouriteNotice'
import { favourites } from './favouritesStore'
import { FilterChip } from './FilterChip'

const SEARCH_DEBOUNCE_MS = 300

type Result = { key: string; recipes: RecipeSummary[] } | { key: string; failed: true }

function RecipeCard({ recipe }: { recipe: RecipeSummary }) {
  const extras = [recipe.hasLink && 'Has a link', recipe.hasNotes && 'Has notes', recipe.hasFiles && 'Has files'].filter(Boolean)
  return (
    <li>
      <Card className="relative p-4 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ring">
        {/* The heart is a sibling of the link (never nested in it), above the link's card-sized overlay. */}
        <FavouriteButton recipeId={recipe.id} favourite={recipe.favourite} describedBy={`recipe-title-${recipe.id}`} className="absolute right-1 top-1 z-10" />
        <h3 className="pr-12 text-xl">
          <Link id={`recipe-title-${recipe.id}`} to={`/recipes/${recipe.id}`} className="outline-none after:absolute after:inset-0">
            {recipe.title}
          </Link>
        </h3>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Badge variant="highlight">{timeLabel(recipe.timeTag)}</Badge>
          {recipe.categories.map((c) => (
            <Badge key={c} variant="tint">{c}</Badge>
          ))}
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          Added by {recipe.addedBy} on {formatDate(recipe.createdAt)}
        </p>
        {extras.length > 0 && <p className="mt-1 text-sm text-muted-foreground">{extras.join(' · ')}</p>}
      </Card>
    </li>
  )
}

export function RecipeList() {
  const { status } = useAuth()
  const [time, setTime] = useState<TimeTag | null>(null)
  const [categories, setCategories] = useState<Category[]>([])
  const [onlyFavourites, setOnlyFavourites] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [q, setQ] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [result, setResult] = useState<Result | null>(null)

  useEffect(() => {
    const t = setTimeout(() => setQ(search), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [search])

  // Refetch after signing back in (status returns to signed-in), after a retry, or when a filter changes.
  const key = JSON.stringify([time, categories, q.trim(), onlyFavourites, attempt, status === 'signed-in'])
  useEffect(() => {
    const controller = new AbortController()
    const started = favourites.mark()
    listRecipes({ time, categories, q, favourites: onlyFavourites }, controller.signal).then(
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
  }, [key, time, categories, q, onlyFavourites])

  const current = result && result.key === key ? result : null
  const otherFilters = time !== null || categories.length > 0 || q.trim() !== ''
  const filtering = otherFilters || onlyFavourites

  function toggleCategory(c: Category) {
    // One category at a time (owner decision): tapping another switches, tapping the selected one clears.
    setCategories((prev) => (prev.includes(c) ? [] : [c]))
  }
  function clearFilters(clearFavourites = true) {
    setTime(null)
    setCategories([])
    setSearch('')
    setQ('')
    if (clearFavourites) setOnlyFavourites(false)
  }

  return (
    <section className="flex flex-col gap-4" style={{ paddingBottom: 'calc(6.5rem + env(safe-area-inset-bottom))' }}>
      <div className="flex flex-col gap-4">
        {/* No visible label (owner decision): the icon and placeholder say what it does; aria-label names it. */}
        <div className="relative">
          <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <Input
            id="recipe-search"
            type="search"
            aria-label="Search recipes by name"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search recipes, e.g. pasta"
            autoComplete="off"
            className="pl-10"
          />
        </div>
        {/* One scrolling row, no visible label (owner decision): Favourites toggle, a divider, then the
            single-select categories. Bleeds to the screen edge so the cut-off chip hints at more. */}
        <div role="group" aria-label="Favourites and category" className="-mx-4 flex items-center gap-2 overflow-x-auto px-4 py-1 [&>*]:shrink-0 [&>*]:whitespace-nowrap">
          <FilterChip pressed={onlyFavourites} onClick={() => setOnlyFavourites((on) => !on)}>
            <span aria-hidden="true">♡&nbsp;</span>Favourites
          </FilterChip>
          <span aria-hidden="true" className="h-6 w-px bg-input" />
          <FilterChip pressed={categories.length === 0} onClick={() => setCategories([])}>All</FilterChip>
          {CATEGORIES.map((c) => (
            <FilterChip key={c} pressed={categories.includes(c)} onClick={() => toggleCategory(c)}>{c}</FilterChip>
          ))}
        </div>
        {/* Time is rarely used, so it sits behind "More filters" (owner decision). The button shows
            when a time filter is on, so a hidden filter is never a surprise. */}
        {/* -mt-2 against the block's 16px gap: sits 8px under the chip row; the section gap gives 16px before the list. */}
        <div className="-mt-2">
          <button
            type="button"
            aria-expanded={moreOpen}
            aria-controls="more-filters"
            onClick={() => setMoreOpen((open) => !open)}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-lg text-[15px] font-medium text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            More filters{time !== null ? ' (1 on)' : ''}
            <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={'transition-transform ' + (moreOpen ? 'rotate-180' : '')}>
              <path d="m6 9 6 6 6-6" />
            </svg>
          </button>
          {moreOpen && (
            <fieldset id="more-filters" className="mt-2 min-w-0">
              <legend className="mb-1.5"><SectionLabel>How long it takes</SectionLabel></legend>
              <div className="flex flex-wrap gap-2">
                <FilterChip pressed={time === null} onClick={() => setTime(null)}>All</FilterChip>
                {TIME_TAGS.map((t) => (
                  <FilterChip key={t} pressed={time === t} onClick={() => setTime(t)}>{timeLabel(t)}</FilterChip>
                ))}
              </div>
            </fieldset>
          )}
        </div>
      </div>

      <div id="recipe-results" aria-live="polite">
        {!current && <p role="status" className="text-muted-foreground">Loading recipes...</p>}
        {current && 'failed' in current && (
          <div className="flex flex-col items-start gap-3">
            <Banner tone="error" className="w-full">Could not load the recipes. Check your connection and try again.</Banner>
            <Button variant="secondary" onClick={() => setAttempt((n) => n + 1)}>Try again</Button>
          </div>
        )}
        {current && 'recipes' in current && current.recipes.length === 0 && (
          onlyFavourites && !otherFilters ? (
            <p className="text-muted-foreground">Tap <span aria-hidden="true">♡</span><span className="sr-only">the heart</span> on a recipe to save it here</p>
          ) : filtering ? (
            <div className="flex flex-col items-start gap-1">
              <p className="text-lg font-semibold">No matching recipes</p>
              <button type="button" onClick={() => clearFilters()} className="inline-flex min-h-11 items-center rounded-lg font-semibold text-primary underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">Clear filters</button>
            </div>
          ) : (
            <div className="flex flex-col items-start gap-3">
              <p className="text-lg font-semibold">No recipes saved yet</p>
              <p className="text-muted-foreground">Tap the green + button to add the first family favourite, with a link, a few notes or a photo.</p>
            </div>
          )
        )}
        {current && 'recipes' in current && current.recipes.length > 0 && (
          <ul className="flex flex-col gap-3">
            {current.recipes.map((r) => (
              <RecipeCard key={r.id} recipe={r} />
            ))}
          </ul>
        )}
      </div>

      <FavouriteNotice />

      {/* Floating add button. Right edge: the content column's right edge (36rem = max-w-xl) on wide screens, the viewport edge on phones. */}
      <Link
        to="/recipes/new"
        aria-label="Add recipe"
        className="fixed z-10 flex size-14 items-center justify-center rounded-full border-4 border-background bg-primary text-primary-foreground hover:bg-primary/90 active:bg-primary/80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        style={{
          bottom: 'calc(1rem + env(safe-area-inset-bottom))',
          right: 'max(calc(1rem + env(safe-area-inset-right)), calc((100vw - 36rem) / 2 + 1rem))',
        }}
      >
        <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
          <path d="M12 5v14M5 12h14" />
        </svg>
      </Link>
    </section>
  )
}
