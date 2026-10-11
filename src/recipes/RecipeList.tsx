import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Badge, Banner, Button, Card, Input, OutbuildMark, SectionLabel } from '@design-system/components'
import { APP_NAME } from '../auth/AppShell'
import { useAuth } from '../auth/AuthContext'
import { CATEGORIES, TIME_TAGS, formatDate, listRecipes } from '../lib/recipes'
import type { Category, RecipeSummary, TimeTag } from '../lib/recipes'
import { FilterChip } from './FilterChip'

const SEARCH_DEBOUNCE_MS = 300

type Result = { key: string; recipes: RecipeSummary[] } | { key: string; failed: true }

function RecipeCard({ recipe }: { recipe: RecipeSummary }) {
  const extras = [recipe.hasLink && 'Has a link', recipe.hasNotes && 'Has notes', recipe.hasFiles && 'Has files'].filter(Boolean)
  return (
    <li>
      <Card className="relative p-4 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ring">
        <h3 className="text-xl">
          <Link to={`/recipes/${recipe.id}`} className="outline-none after:absolute after:inset-0">
            {recipe.title}
          </Link>
        </h3>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Badge variant="highlight">{recipe.timeTag}</Badge>
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
  const [search, setSearch] = useState('')
  const [q, setQ] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [result, setResult] = useState<Result | null>(null)

  useEffect(() => {
    const t = setTimeout(() => setQ(search), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [search])

  // Refetch after signing back in (status returns to signed-in), after a retry, or when a filter changes.
  const key = JSON.stringify([time, categories, q.trim(), attempt, status === 'signed-in'])
  useEffect(() => {
    const controller = new AbortController()
    listRecipes({ time, categories, q }, controller.signal).then(
      (recipes) => setResult({ key, recipes }),
      () => {
        if (!controller.signal.aborted) setResult({ key, failed: true })
      },
    )
    return () => controller.abort()
  }, [key, time, categories, q])

  const current = result && result.key === key ? result : null
  const filtering = time !== null || categories.length > 0 || q.trim() !== ''

  function toggleCategory(c: Category) {
    setCategories((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]))
  }
  function clearFilters() {
    setTime(null)
    setCategories([])
    setSearch('')
    setQ('')
  }

  return (
    <section className="flex flex-col gap-6" style={{ paddingBottom: 'calc(6.5rem + env(safe-area-inset-bottom))' }}>
      <div className="flex flex-col gap-4">
        <div className="space-y-1.5">
          <label htmlFor="recipe-search" className="block text-sm font-semibold">Search by title</label>
          <Input
            id="recipe-search"
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Try pasta or traybake"
            autoComplete="off"
          />
        </div>
        <fieldset className="min-w-0">
          <legend className="mb-1.5"><SectionLabel>How long it takes</SectionLabel></legend>
          <div className="flex flex-wrap gap-2">
            <FilterChip pressed={time === null} onClick={() => setTime(null)}>All</FilterChip>
            {TIME_TAGS.map((t) => (
              <FilterChip key={t} pressed={time === t} onClick={() => setTime(t)}>{t}</FilterChip>
            ))}
          </div>
        </fieldset>
        <fieldset className="min-w-0">
          <legend className="mb-1.5"><SectionLabel>Category (pick as many as you like)</SectionLabel></legend>
          <div className="flex flex-wrap gap-2">
            <FilterChip pressed={categories.length === 0} onClick={() => setCategories([])}>All</FilterChip>
            {CATEGORIES.map((c) => (
              <FilterChip key={c} pressed={categories.includes(c)} onClick={() => toggleCategory(c)}>{c}</FilterChip>
            ))}
          </div>
        </fieldset>
      </div>

      <div aria-live="polite">
        {!current && <p role="status" className="text-muted-foreground">Loading recipes...</p>}
        {current && 'failed' in current && (
          <div className="flex flex-col items-start gap-3">
            <Banner tone="error" className="w-full">Could not load the recipes. Check your connection and try again.</Banner>
            <Button variant="secondary" onClick={() => setAttempt((n) => n + 1)}>Try again</Button>
          </div>
        )}
        {current && 'recipes' in current && current.recipes.length === 0 && (
          filtering ? (
            <div className="flex flex-col items-start gap-3">
              <p className="text-lg font-semibold">No recipes match</p>
              <p className="text-muted-foreground">Try a different word, or loosen the time and category choices.</p>
              <Button variant="secondary" onClick={clearFilters}>Clear filters</Button>
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

      <OutbuildMark appName={APP_NAME} className="pt-6" />

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
