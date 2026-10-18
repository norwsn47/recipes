import { useCallback, useEffect, useId, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Banner, Button, Field, Input, Textarea } from '@design-system/components'
import {
  ApiError, CATEGORIES, FILE_ACCEPT, MAX_FILES, MAX_LINK, MAX_NOTES, MAX_RECIPE_FILE_BYTES, MAX_TITLE, MB, TIME_TAGS,
  checkFile, createRecipe, fetchLinkTitle, formatBytes, getRecipe, isWebLink, timeLabel, updateRecipe, validateRecipe,
} from '../lib/recipes'
import { nameFromFileName, nameFromUrl } from '../lib/names'
import type { Category, FieldErrors, RecipeFile, RecipeInput, TimeTag } from '../lib/recipes'
import { BackLink } from './BackLink'
import { FilterChip } from './FilterChip'

const EMPTY: RecipeInput = { title: '', timeTag: '', categories: [], link: '', notes: '' }

// Codes whose server message is shown exactly as given.
const SERVER_MESSAGE_CODES = new Set([
  'too_many_files', 'file_too_large', 'recipe_files_too_large', 'file_type_not_allowed', 'user_storage_limit_reached',
  'storage_full', 'recipe_limit_reached', 'conflict', 'rate_limited', 'storage_unavailable', 'invalid_upload',
])
// Refusals about a particular file: say so, and point at the Remove button.
const FILE_SPECIFIC_CODES = new Set(['file_too_large', 'file_type_not_allowed', 'invalid_upload'])

const fileKey = (f: File) => `${f.name}|${f.size}|${f.lastModified}`
const LINK_LOOKUP_DELAY_MS = 600
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** A group of toggle chips with a legend and an error tied to the group (aria-describedby on the fieldset). */
function Group({ legend, hint, error, children }: { legend: string; hint?: string; error?: string; children: React.ReactNode }) {
  const id = useId()
  const describedBy = [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(' ') || undefined
  return (
    <fieldset
      className="min-w-0 space-y-2 rounded-lg outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      tabIndex={-1}
      data-invalid={error ? 'true' : undefined}
      aria-describedby={describedBy}
    >
      <legend className="mb-1.5 text-sm font-semibold">{legend}</legend>
      {hint && <p id={`${id}-hint`} className="text-sm text-muted-foreground">{hint}</p>}
      <div className="flex flex-wrap gap-2">{children}</div>
      {error && <p id={`${id}-error`} role="alert" className="text-sm font-semibold text-destructive">{error}</p>}
    </fieldset>
  )
}

const textButtonClass =
  'inline-flex min-h-11 items-center self-start rounded-lg px-1 font-semibold text-primary underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring'

function BigChoice({ title, hint, onClick, autoFocus }: { title: string; hint: string; onClick(): void; autoFocus?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      autoFocus={autoFocus}
      className="flex min-h-32 w-full flex-col items-start justify-center gap-1 rounded-lg border border-input bg-background px-5 py-4 text-left hover:bg-accent active:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      <span className="text-2xl font-bold tracking-tight text-primary">{title}</span>
      <span className="text-base text-muted-foreground">{hint}</span>
    </button>
  )
}

/**
 * Add (/recipes/new) and edit (/recipes/:id/edit). It lives inside AppShell, so if the session
 * expires the form stays mounted behind the sign-in overlay and every typed value is kept; after
 * signing back in, "Save" can be pressed again.
 */
export function RecipeForm() {
  const { id } = useParams()
  const editing = id !== undefined
  const navigate = useNavigate()
  const formRef = useRef<HTMLFormElement>(null)
  const [values, setValues] = useState<RecipeInput>(EMPTY)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [banner, setBanner] = useState('')
  const [saving, setSaving] = useState(false)
  const [focusTick, setFocusTick] = useState(0)
  const [load, setLoad] = useState<'loading' | 'ready' | 'not-found' | 'forbidden' | 'failed'>(editing ? 'loading' : 'ready')
  const [attempt, setAttempt] = useState(0)
  const [existingFiles, setExistingFiles] = useState<RecipeFile[]>([])
  const [removedIds, setRemovedIds] = useState<string[]>([])
  const [newFiles, setNewFiles] = useState<File[]>([])
  const [fileNotes, setFileNotes] = useState<string[]>([])
  const pickerRef = useRef<HTMLInputElement>(null)
  // Quick-add (new recipes only): the two big choices first, then the rest of the form.
  const [step, setStep] = useState<'start' | 'form'>('start')
  const [showLink, setShowLink] = useState(false)
  const [showFiles, setShowFiles] = useState(false)
  const [notesOpen, setNotesOpen] = useState(false)
  // Where focus goes when the step changes (the tapped button unmounts). Applied by autoFocus as the target mounts.
  const [focusTarget, setFocusTarget] = useState<'link' | 'name' | 'notes' | 'choice' | null>(null)
  // Name suggestions. nameEdited is set only by the person typing in the name field; suggestions never set it.
  const nameEdited = useRef(false)
  const nameSource = useRef<'link' | 'file' | null>(null)
  const lookupTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const lookupAbort = useRef<AbortController | null>(null)
  const lookedUp = useRef(new Set<string>())
  const pasted = useRef(false)

  useEffect(() => {
    if (!id) return
    const controller = new AbortController()
    getRecipe(id, controller.signal).then(
      (r) => {
        if (!r.canEdit) {
          setLoad('forbidden')
          return
        }
        setValues({ title: r.title, timeTag: r.timeTag, categories: r.categories, link: r.link ?? '', notes: r.notes ?? '' })
        setExistingFiles(r.files)
        setLoad('ready')
      },
      (err: unknown) => {
        if (controller.signal.aborted) return
        setLoad(err instanceof ApiError && err.status === 404 ? 'not-found' : 'failed')
      },
    )
    return () => controller.abort()
  }, [id, attempt])

  // After an error, move focus to the first invalid field, or to the banner when the problem is not tied to a field.
  useEffect(() => {
    if (focusTick === 0) return
    const target = formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"], [data-invalid="true"]') ?? formRef.current?.querySelector<HTMLElement>('[data-banner]')
    target?.focus()
  }, [focusTick])

  useEffect(() => () => {
    clearTimeout(lookupTimer.current)
    lookupAbort.current?.abort()
  }, [])

  const set = useCallback(<K extends keyof RecipeInput>(k: K, v: RecipeInput[K]) => setValues((p) => ({ ...p, [k]: v })), [])

  const keptExisting = existingFiles.filter((f) => !removedIds.includes(f.id))
  const fileCount = keptExisting.length + newFiles.length
  const totalBytes = keptExisting.reduce((n, f) => n + f.size, 0) + newFiles.reduce((n, f) => n + f.size, 0)
  const hasText = values.link.trim() !== '' || values.notes.trim() !== ''

  /** Append the chosen files, skipping duplicates and anything the server would refuse, and say why. */
  function addFiles(chosen: File[]) {
    const notes: string[] = []
    const accepted = [...newFiles]
    let count = fileCount
    let bytes = totalBytes
    for (const f of chosen) {
      if (accepted.some((a) => fileKey(a) === fileKey(f))) continue
      const problem = checkFile(f)
      if (problem) notes.push(problem)
      else if (count >= MAX_FILES) notes.push(`${f.name} was not added. A recipe can have up to ${MAX_FILES} files.`)
      else if (bytes + f.size > MAX_RECIPE_FILE_BYTES) notes.push(`${f.name} was not added. The files on one recipe can total up to 25 MB.`)
      else {
        accepted.push(f)
        count += 1
        bytes += f.size
      }
    }
    setNewFiles(accepted)
    setFileNotes(notes)
    setShowFiles(true)
    if (!editing && !nameEdited.current && accepted.length > newFiles.length) {
      const guess = nameFromFileName(accepted[0].name)
      // A name that came from a link, or one the person typed, is never overwritten by a file.
      if (guess && values.title.trim() === '' ) {
        nameSource.current = 'file'
        setValues((p) => ({ ...p, title: guess }))
      }
    }
    setErrors((p) => ({ ...p, content: undefined }))
  }

  function onLinkChange(raw: string) {
    set('link', raw)
    if (editing) return
    const value = raw.trim()
    if (!nameEdited.current) {
      const guess = nameFromUrl(value)
      if (guess) {
        nameSource.current = 'link'
        setValues((p) => ({ ...p, title: guess }))
      } else if (nameSource.current === 'link') {
        nameSource.current = null
        setValues((p) => ({ ...p, title: '' }))
      }
    }
    clearTimeout(lookupTimer.current)
    lookupAbort.current?.abort()
    const immediate = pasted.current
    pasted.current = false
    if (!value || value.length > MAX_LINK || !isWebLink(value) || lookedUp.current.has(value)) return
    lookupTimer.current = setTimeout(() => {
      const controller = new AbortController()
      lookupAbort.current = controller
      void fetchLinkTitle(value, controller.signal).then((title) => {
        // Only a completed response counts as looked up; aborted or failed attempts can be retried.
        if (controller.signal.aborted || title === null) return
        lookedUp.current.add(value)
        if (!title || nameEdited.current) return
        nameSource.current = 'link'
        setValues((p) => ({ ...p, title }))
      })
    }, immediate ? 0 : LINK_LOOKUP_DELAY_MS)
  }

  function chooseLink() {
    setShowLink(true)
    setFocusTarget('link')
    setStep('form')
  }

  function chooseFiles() {
    // Called straight from the tap so the browser allows the picker to open.
    pickerRef.current?.click()
  }

  function toggleExisting(file: RecipeFile) {
    if (removedIds.includes(file.id)) {
      setRemovedIds((p) => p.filter((x) => x !== file.id))
      setFileNotes([])
      return
    }
    if (fileCount <= 1 && !hasText) {
      setFileNotes([`${file.name} is the only thing in this recipe, so it cannot be removed. Add a link or some notes first, or delete the whole recipe instead.`])
      return
    }
    setRemovedIds((p) => [...p, file.id])
    setFileNotes([])
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (saving) return
    const found = validateRecipe(values, fileCount)
    setErrors(found)
    setBanner('')
    if (Object.keys(found).length > 0) {
      setFocusTick((n) => n + 1)
      return
    }
    if (fileCount > MAX_FILES || totalBytes > MAX_RECIPE_FILE_BYTES) {
      setBanner(fileCount > MAX_FILES ? `A recipe can have up to ${MAX_FILES} files. Remove some and try again.` : 'The files on one recipe can total up to 25 MB. Remove some and try again.')
      setFocusTick((n) => n + 1)
      return
    }
    setSaving(true)
    try {
      const saved = editing ? await updateRecipe(id, values, newFiles, removedIds) : await createRecipe(values, newFiles)
      navigate(`/recipes/${saved.id}`)
    } catch (err) {
      if (err instanceof ApiError && err.code === 'validation_failed') {
        setErrors(err.fields)
        const general = [err.fields.body, err.fields.removeFileIds].filter(Boolean).join(' ')
        if (general) setBanner(general)
      } else if (err instanceof ApiError && SERVER_MESSAGE_CODES.has(err.code)) {
        setBanner(FILE_SPECIFIC_CODES.has(err.code) ? `${err.message} Remove that file below, or choose a different one, then save again.` : err.message)
      } else if (err instanceof ApiError && err.status === 401) {
        setBanner(`You were signed out, so the recipe was not saved. Sign in and press Save again. Everything you typed is still here${newFiles.length > 0 ? ', but you may need to choose your files again' : ''}.`)
      } else if (err instanceof ApiError && err.status === 403) {
        setBanner('Only the person who added this recipe can change it.')
      } else if (err instanceof ApiError && err.status === 404) {
        setBanner('This recipe no longer exists, so it could not be saved.')
      } else if (err instanceof ApiError && err.status === 413) {
        setBanner('That is too much to save in one go. Shorten the notes and try again.')
      } else {
        // Includes a session that ended mid-save: the sign-in overlay appears, and nothing typed is lost.
        setBanner(`The recipe was not saved. If you were asked to sign in, do that and press Save again${newFiles.length > 0 ? ' (you may need to choose your files again)' : ''}. Otherwise check your connection and try again.`)
      }
      setFocusTick((n) => n + 1)
    } finally {
      setSaving(false)
    }
  }

  const cancelTo = editing ? `/recipes/${id}` : '/'

  if (load === 'loading') return <p role="status" className="py-4 text-muted-foreground">Opening the recipe...</p>
  if (load !== 'ready') {
    return (
      <section className="flex flex-col items-start gap-3 py-4">
        {load === 'not-found' && (<><h2 className="text-2xl">Recipe not found</h2><p className="text-muted-foreground">It may have been deleted, or the link is not quite right.</p></>)}
        {load === 'forbidden' && (<><h2 className="text-2xl">You cannot edit this one</h2><p className="text-muted-foreground">Only the person who added a recipe can change it.</p></>)}
        {load === 'failed' && (
          <>
            <Banner tone="error" className="w-full">Could not open this recipe. Check your connection and try again.</Banner>
            <Button variant="secondary" onClick={() => { setLoad('loading'); setAttempt((n) => n + 1) }}>Try again</Button>
          </>
        )}
        <BackLink>Back to all recipes</BackLink>
      </section>
    )
  }

  const linkShown = editing || showLink || values.link !== '' || errors.link !== undefined
  const filesShown = editing || showFiles || fileCount > 0
  const notesShown = editing || notesOpen || values.notes !== '' || errors.notes !== undefined
  const onStart = !editing && step === 'start'

  const picker = (
    <input
      ref={pickerRef}
      type="file"
      multiple
      accept={FILE_ACCEPT}
      className="hidden"
      tabIndex={-1}
      aria-hidden="true"
      onChange={(e) => {
        const chosen = Array.from(e.target.files ?? [])
        e.target.value = ''
        if (chosen.length === 0) return
        addFiles(chosen)
        if (step === 'start') setFocusTarget('name')
        setStep('form')
      }}
    />
  )

  if (onStart) {
    return (
      <form ref={formRef} onSubmit={(e) => e.preventDefault()} className="flex flex-col gap-5 pb-8">
        <div><BackLink>All recipes</BackLink></div>
        <h2 className="text-3xl">Add a recipe</h2>
        <p className="text-muted-foreground">Where is it from?</p>
        <div className="flex flex-col gap-4">
          <BigChoice title="Paste a link" hint="A recipe from a website" onClick={chooseLink} autoFocus={focusTarget === 'choice'} />
          <BigChoice title="Add photo or file" hint="Take a photo, or pick a photo or PDF" onClick={chooseFiles} />
        </div>
        <button type="button" className={textButtonClass} onClick={() => { setNotesOpen(true); setFocusTarget('notes'); setStep('form') }}>
          or just add notes
        </button>
        {picker}
      </form>
    )
  }

  return (
    <form ref={formRef} onSubmit={(e) => void onSubmit(e)} noValidate className="flex flex-col gap-6 pb-8">
      <div className="flex flex-wrap items-center justify-between gap-x-4">
        <BackLink to={cancelTo}>{editing ? 'Back to the recipe' : 'All recipes'}</BackLink>
        {!editing && (
          <button type="button" className={textButtonClass} onClick={() => { setFocusTarget('choice'); setStep('start') }} disabled={saving}>
            Back to the choices
          </button>
        )}
      </div>
      <h2 className="text-3xl">{editing ? 'Edit recipe' : 'Add a recipe'}</h2>

      {banner && (
        <Banner tone="error" tabIndex={-1} data-banner="">{banner}</Banner>
      )}

      {errors.content && <p role="alert" data-invalid="true" tabIndex={-1} className="text-sm font-semibold text-destructive outline-none">{errors.content}</p>}

      {linkShown && (
        <Field label="Link" hint="Starts with http:// or https://" error={errors.link}>
          <Input
            type="url"
            inputMode="url"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            value={values.link}
            maxLength={MAX_LINK}
            autoFocus={focusTarget === 'link'}
            onPaste={() => { pasted.current = true }}
            onChange={(e) => onLinkChange(e.target.value)}
          />
        </Field>
      )}

      <Field label="Name" error={errors.title}>
        <Input
          value={values.title}
          maxLength={MAX_TITLE}
          placeholder="Name this recipe"
          autoFocus={focusTarget === 'name'}
          autoComplete="off"
          onChange={(e) => {
            nameEdited.current = true
            set('title', e.target.value)
          }}
        />
      </Field>

      <Group legend="How long does it take?" error={errors.timeTag}>
        {TIME_TAGS.map((t) => (
          <FilterChip key={t} pressed={values.timeTag === t} onClick={() => set('timeTag', t as TimeTag)}>{timeLabel(t)}</FilterChip>
        ))}
      </Group>

      <Group legend="Categories" hint="Choose at least one." error={errors.categories}>
        {CATEGORIES.map((c) => (
          <FilterChip
            key={c}
            pressed={values.categories.includes(c)}
            onClick={() =>
              set('categories', values.categories.includes(c) ? values.categories.filter((x) => x !== c) : CATEGORIES.filter((x) => x === c || values.categories.includes(x as Category)))
            }
          >
            {c}
          </FilterChip>
        ))}
      </Group>

      {filesShown && (
        <div className="space-y-2">
          <p className="text-sm font-semibold">Photos or files</p>
          <p id="files-hint" className="text-sm text-muted-foreground">
            PDF, PNG, JPG or HEIC. Up to {MAX_FILES} files, 10 MB each, 25 MB in total.
            {fileCount > 0 && ` ${plural(fileCount, 'file', 'files')} so far, ${formatBytes(totalBytes)} of ${MAX_RECIPE_FILE_BYTES / MB} MB.`}
          </p>
          {fileNotes.length > 0 && (
            <ul role="alert" className="space-y-1 text-sm font-semibold text-destructive">
              {fileNotes.map((n) => <li key={n}>{n}</li>)}
            </ul>
          )}
          {existingFiles.length > 0 && (
            <ul className="space-y-2" aria-label="Files already on this recipe">
              {existingFiles.map((f) => {
                const removed = removedIds.includes(f.id)
                return (
                  <li key={f.id} className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-1">
                    <span className={`min-w-0 text-sm [overflow-wrap:anywhere] ${removed ? 'text-muted-foreground line-through' : ''}`}>
                      {f.name} <span className="text-muted-foreground">({formatBytes(f.size)})</span>
                      {removed && <span className="block no-underline text-muted-foreground">Will be removed when you save</span>}
                    </span>
                    <Button variant="ghost" className="shrink-0" onClick={() => toggleExisting(f)} disabled={saving} aria-label={`${removed ? 'Keep' : 'Remove'} ${f.name}`}>
                      {removed ? 'Undo' : 'Remove'}
                    </Button>
                  </li>
                )
              })}
            </ul>
          )}
          {newFiles.length > 0 && (
            <ul className="space-y-2" aria-label="Files to add">
              {newFiles.map((f) => (
                <li key={fileKey(f)} className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-1">
                  <span className="min-w-0 text-sm [overflow-wrap:anywhere]">
                    {f.name} <span className="text-muted-foreground">({formatBytes(f.size)})</span>
                  </span>
                  <Button
                    variant="ghost"
                    className="shrink-0"
                    onClick={() => { setNewFiles((p) => p.filter((x) => fileKey(x) !== fileKey(f))); setFileNotes([]) }}
                    disabled={saving}
                    aria-label={`Remove ${f.name}`}
                  >
                    Remove
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <Button variant="secondary" onClick={chooseFiles} disabled={saving} aria-describedby="files-hint">
            {fileCount > 0 ? 'Add more files' : 'Add photo or file'}
          </Button>
        </div>
      )}
      {picker}

      {notesShown && (
        <Field label="Notes" hint={`${values.notes.length.toLocaleString('en-GB')} of ${MAX_NOTES.toLocaleString('en-GB')} characters. Plain text only.`} error={errors.notes}>
          <Textarea rows={6} autoFocus={focusTarget === 'notes'} value={values.notes} maxLength={MAX_NOTES} onChange={(e) => set('notes', e.target.value)} />
        </Field>
      )}

      {(!linkShown || !filesShown || !notesShown) && (
        <div className="flex flex-wrap gap-x-5">
          {!linkShown && <button type="button" className={textButtonClass} onClick={chooseLink}>Add a link</button>}
          {!filesShown && <button type="button" className={textButtonClass} onClick={chooseFiles}>Add photo or file</button>}
          {!notesShown && <button type="button" className={textButtonClass} onClick={() => setNotesOpen(true)}>Add notes</button>}
        </div>
      )}

      <div className="flex flex-col gap-3">
        <Button type="submit" size="lg" disabled={saving}>{saving ? (newFiles.length > 0 ? `Uploading ${plural(newFiles.length, 'file', 'files')}...` : 'Saving...') : editing ? 'Save changes' : 'Save recipe'}</Button>
        <Button variant="secondary" onClick={() => navigate(cancelTo)} disabled={saving}>Cancel</Button>
      </div>
    </form>
  )
}
