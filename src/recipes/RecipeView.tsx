import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Badge, Banner, Button, Dialog, SectionLabel } from '@design-system/components'
import { useAuth } from '../auth/AuthContext'
import { firstName, shortDate } from '../lib/format'
import { ApiError, deleteRecipe, getRecipe, timeLabel } from '../lib/recipes'
import type { RecipeDetail } from '../lib/recipes'
import { BackLink } from './BackLink'
import { FavouriteButton } from './FavouriteButton'
import { Notice } from './Notice'
import { favourites } from './favouritesStore'
import { OverflowMenu } from './OverflowMenu'
import { RecipeFiles } from './RecipeFiles'
import { ShareButton } from './ShareButton'

type Result = { key: string; recipe: RecipeDetail } | { key: string; error: 'not-found' | 'failed' }

export function RecipeView() {
  const { id = '' } = useParams()
  const { status } = useAuth()
  const navigate = useNavigate()
  const [attempt, setAttempt] = useState(0)
  const [result, setResult] = useState<Result | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [actionError, setActionError] = useState('')

  const key = `${id}|${attempt}|${status === 'signed-in'}`
  useEffect(() => {
    const controller = new AbortController()
    const started = favourites.mark()
    getRecipe(id, controller.signal).then(
      (recipe) => {
        favourites.seed(recipe.id, started)
        setResult({ key, recipe })
      },
      (err: unknown) => {
        if (controller.signal.aborted) return
        setResult({ key, error: err instanceof ApiError && err.status === 404 ? 'not-found' : 'failed' })
      },
    )
    return () => controller.abort()
  }, [key, id])

  const closeConfirm = useCallback(() => setConfirming(false), [])

  async function confirmDelete() {
    setDeleting(true)
    setActionError('')
    try {
      await deleteRecipe(id)
      navigate('/')
    } catch (err) {
      setConfirming(false)
      if (err instanceof ApiError && err.status === 403) setActionError('Only the person who added this recipe can delete it.')
      else if (err instanceof ApiError && err.status === 404) setActionError('This recipe has already been deleted.')
      else if (err instanceof ApiError && err.status === 429) setActionError(err.message)
      else setActionError('Could not delete the recipe. If you were signed out, sign in and try again.')
    } finally {
      setDeleting(false)
    }
  }

  const current = result && result.key === key ? result : null

  if (!current) return <p role="status" className="py-4 text-muted-foreground">Opening the recipe...</p>

  if ('error' in current) {
    return current.error === 'not-found' ? (
      <section className="flex flex-col items-start gap-3 py-4">
        <h2 className="text-2xl">Recipe not found</h2>
        <p className="text-muted-foreground">It may have been deleted, or the link is not quite right.</p>
        <BackLink>Back to all recipes</BackLink>
      </section>
    ) : (
      <section className="flex flex-col items-start gap-3 py-4">
        <Banner tone="error" className="w-full">Could not open this recipe. Check your connection and try again.</Banner>
        <Button variant="secondary" onClick={() => setAttempt((n) => n + 1)}>Try again</Button>
        <BackLink>Back to all recipes</BackLink>
      </section>
    )
  }

  const r = current.recipe
  return (
    <article className="flex flex-col gap-5 pb-8">
      <div className="flex items-center gap-2">
        <h2 id="recipe-view-title" className="min-w-0 flex-1 text-3xl [overflow-wrap:anywhere]">{r.title}</h2>
        <div className="-mr-2 flex shrink-0 items-center">
          <ShareButton recipe={r} />
          <FavouriteButton recipeId={r.id} favourite={r.favourite} describedBy="recipe-view-title" />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-2">
        <Badge variant="tint">{timeLabel(r.timeTag)}</Badge>
        {r.categories.map((c) => (
          <Badge key={c} variant="tint">{c}</Badge>
        ))}
        <p className="text-sm text-muted-foreground">{firstName(r.addedBy)} · {shortDate(r.createdAt)}</p>
      </div>

      {r.link && (
        <div className="space-y-1.5">
          <SectionLabel>Link</SectionLabel>
          <a
            href={r.link}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center text-primary underline [overflow-wrap:anywhere] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            {r.link}<span className="sr-only"> (opens in a new tab)</span>
          </a>
        </div>
      )}

      {r.notes && (
        <div className="space-y-1.5">
          <SectionLabel>Notes</SectionLabel>
          {/* Rendered as a text node only, never as HTML; line breaks come from CSS. */}
          <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{r.notes}</p>
        </div>
      )}

      <RecipeFiles files={r.files} />

      {actionError && <Banner tone="error">{actionError}</Banner>}

      {r.canEdit && (
        <div className="flex flex-wrap items-center gap-3">
          <Link
            to={`/recipes/${r.id}/edit`}
            className="inline-flex min-h-11 items-center justify-center rounded-lg border border-input px-5 font-semibold text-foreground hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            Edit recipe
          </Link>
          <OverflowMenu actions={[{ label: 'Delete recipe', onSelect: () => setConfirming(true) }]} />
        </div>
      )}

      <Notice />

      <Dialog open={confirming} onClose={closeConfirm} title="Delete this recipe?">
        <p className="mb-5 text-muted-foreground">
          &ldquo;{r.title}&rdquo; will be gone for everyone. This cannot be undone.
        </p>
        <div className="flex flex-col gap-3">
          <Button variant="destructive" onClick={() => void confirmDelete()} disabled={deleting}>
            {deleting ? 'Deleting...' : 'Yes, delete it'}
          </Button>
          <Button variant="secondary" onClick={closeConfirm}>Keep the recipe</Button>
        </div>
      </Dialog>
    </article>
  )
}
