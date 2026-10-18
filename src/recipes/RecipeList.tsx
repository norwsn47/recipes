import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Badge, Banner, Button, Card, Input, SectionLabel } from '@design-system/components'
import { useAuth } from '../auth/AuthContext'
import { linkHostname, shortDate } from '../lib/format'
import { CATEGORIES, TIME_TAGS, listRecipes, timeLabel } from '../lib/recipes'
import type { Category, RecipeSummary, TimeTag } from '../lib/recipes'
import { FavouriteButton } from './FavouriteButton'
import { Notice } from './Notice'
import { favourites } from './favouritesStore'
import { FilterChip } from './FilterChip'
import { ShareButton } from './ShareButton'

const SEARCH_DEBOUNCE_MS = 300

// Functional update that keeps the same array when already empty, so the fetch effect does not re-run.
const none = (prev: Category[]): Category[] => (prev.length === 0 ? prev : [])

type Result = { key: string; recipes: RecipeSummary[] } | { key: string; failed: true }

function RecipeCard({ recipe }: { recipe: RecipeSummary }) {
  // Compact meta (owner decision): first name and short date, plus a paperclip when there are files.
  const domain = recipe.link ? linkHostname(recipe.link) : null
  return (
    <li>
      {/* p-4! overrides Card's own p-6 (cn does not merge classes). */}
      <Card className="relative p-4! focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ring">
        {/* Share and the heart are siblings of the link (never nested in it), above the link's card-sized overlay. */}
        <ShareButton recipe={recipe} iconClassName="size-[18px]" onClick={(e) => e.stopPropagation()} className="absolute right-12 top-1 z-10" />
        <FavouriteButton recipeId={recipe.id} favourite={recipe.favourite} describedBy={`recipe-title-${recipe.id}`} iconClassName="size-[18px]" className="absolute right-1 top-1 z-10" />
        <h3 className="pr-[6.25rem] text-[20px] leading-tight">
          <Link id={`recipe-title-${recipe.id}`} to={`/recipes/${recipe.id}`} className="outline-none after:absolute after:inset-0">
            {recipe.title}
          </Link>
        </h3>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Badge variant="tint">{timeLabel(recipe.timeTag)}</Badge>
          {recipe.categories.map((c) => (
            <Badge key={c} variant="tint">{c}</Badge>
          ))}
        </div>
        {domain && (
          // A sibling of the title link, above its overlay, so tapping it never opens the detail page.
          <a
            href={recipe.link ?? undefined}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="relative z-10 -mt-1 -mb-2 flex w-fit min-h-11 max-w-full items-center gap-1.5 rounded-sm text-sm font-medium text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
            </svg>
            <span className="min-w-0 max-w-56 truncate">{domain}</span>
            <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
              <path d="M7 17 17 7M8 7h9v9" />
            </svg>
            <span className="sr-only">(opens in a new tab)</span>
          </a>
        )}
        <p className={(domain ? "mt-1" : "mt-2") + " flex items-center gap-1.5 text-sm text-muted-foreground"}>
          <span>{recipe.addedBy} · {shortDate(recipe.createdAt)}</span>
          {recipe.hasFiles && (
            <>
              <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
              </svg>
              <span className="sr-only">Has files</span>
            </>
          )}
        </p>
      </Card>
    </li>
  )
}

export function RecipeList() {
  const { status } = useAuth()
  const [time, setTime] = useState<TimeTag | null>(null)
  const [categories, setCategories] = useState<Category[]>([])
  const [onlyFavourites, setOnlyFavourites] = useState(false)
  const [addedBy, setAddedBy] = useState<string | null>(null)
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
  // "Added by" filters in the browser on the first name the list already carries, so it needs no request
  // and no owner ids or full names leave the server. Two people with the same first name count as one.
  const shown = current && 'recipes' in current
    ? addedBy === null ? current.recipes : current.recipes.filter((r) => r.addedBy === addedBy)
    : null
  // Names come from the last loaded list (kept while the next one loads, so the chips do not flicker).
  // The selected name always stays, so it can be cleared even when no current result matches it.
  const loaded = result && 'recipes' in result ? result.recipes.map((r) => r.addedBy) : []
  const people = [...new Set([...loaded, ...(addedBy === null ? [] : [addedBy])])].sort((a, b) => a.localeCompare(b))
  const moreOn = (time !== null ? 1 : 0) + (addedBy !== null ? 1 : 0)
  const otherFilters = time !== null || categories.length > 0 || q.trim() !== '' || addedBy !== null
  const filtering = otherFilters || onlyFavourites

  const statusText =
    shown
      ? shown.length === 0
        ? filtering ? 'No matching recipes' : 'No recipes saved yet'
        : `${shown.length} ${shown.length === 1 ? 'recipe' : 'recipes'}`
      : ''

  function toggleCategory(c: Category) {
    // One category at a time (owner decision): tapping another switches, tapping the selected one clears.
    setCategories((prev) => (prev.includes(c) ? [] : [c]))
  }
  function clearFilters(clearFavourites = true) {
    setTime(null)
    setAddedBy(null)
    setCategories(none)
    setSearch('')
    setQ('')
    if (clearFavourites) setOnlyFavourites(false)
  }

  return (
    <section className="flex flex-col gap-4">
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
          <FilterChip pressed={categories.length === 0} onClick={() => setCategories(none)}>All</FilterChip>
          {CATEGORIES.map((c) => (
            <FilterChip key={c} pressed={categories.includes(c)} onClick={() => toggleCategory(c)}>{c}</FilterChip>
          ))}
        </div>
        {/* Time and "Added by" are rarely used, so they sit behind "More filters" (owner decision). The
            button counts the ones that are on, so a hidden filter is never a surprise. */}
        {/* -mt-3 against the block's 16px gap, plus the chip row's 4px bottom padding: 8px under the chips. */}
        <div className="-mt-3">
          <button
            type="button"
            aria-expanded={moreOpen}
            aria-controls="more-filters"
            onClick={() => setMoreOpen((open) => !open)}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-lg text-[15px] font-medium text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            More filters{moreOn > 0 ? ` (${moreOn} on)` : ''}
            <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={'transition-transform ' + (moreOpen ? 'rotate-180' : '')}>
              <path d="m6 9 6 6 6-6" />
            </svg>
          </button>
          {moreOpen && (
            <div id="more-filters" className="mt-2 flex flex-col gap-4">
              <fieldset className="min-w-0">
                <legend className="mb-1.5"><SectionLabel>How long it takes</SectionLabel></legend>
                <div className="flex flex-wrap gap-2">
                  <FilterChip pressed={time === null} onClick={() => setTime(null)}>All</FilterChip>
                  {TIME_TAGS.map((t) => (
                    <FilterChip key={t} pressed={time === t} onClick={() => setTime(t)}>{timeLabel(t)}</FilterChip>
                  ))}
                </div>
              </fieldset>
              {people.length > 0 && (
                <fieldset className="min-w-0">
                  <legend className="mb-1.5"><SectionLabel>Added by</SectionLabel></legend>
                  <div className="flex flex-wrap gap-2">
                    <FilterChip pressed={addedBy === null} onClick={() => setAddedBy(null)}>All</FilterChip>
                    {people.map((p) => (
                      <FilterChip key={p} pressed={addedBy === p} onClick={() => setAddedBy(p)}>{p}</FilterChip>
                    ))}
                  </div>
                </fieldset>
              )}
            </div>
          )}
        </div>
      </div>

      <div id="recipe-results" style={{ paddingBottom: 'calc(6rem + env(safe-area-inset-bottom))' }}>
        <h2 className="sr-only">Recipes</h2>
        {/* Announces a short summary once results have loaded; stays empty while loading or on error. */}
        <p role="status" aria-live="polite" aria-atomic="true" className="sr-only">{statusText}</p>
        {!current && <p className="text-muted-foreground">Loading recipes...</p>}
        {current && 'failed' in current && (
          <div className="flex flex-col items-start gap-3">
            <Banner tone="error" className="w-full">Could not load the recipes. Check your connection and try again.</Banner>
            <Button variant="secondary" onClick={() => setAttempt((n) => n + 1)}>Try again</Button>
          </div>
        )}
        {shown && shown.length === 0 && (
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
        {shown && shown.length > 0 && (
          <ul className="flex flex-col gap-3">
            {shown.map((r) => (
              <RecipeCard key={r.id} recipe={r} />
            ))}
          </ul>
        )}
      </div>

      <Notice />

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
