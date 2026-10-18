import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { CSRF_HEADERS, ORIGIN, baseEnv, call, resetDb, setupGoogleMock, signIn } from './helpers'
import type { AppEnv } from '../worker/http'
import { positiveInt } from '../worker/limits'

beforeAll(setupGoogleMock)
beforeEach(resetDb)
afterEach(() => vi.restoreAllMocks())

const MIB = 1024 * 1024
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
const JPEG = [0xff, 0xd8, 0xff, 0xe0]
const PDF = [...'%PDF-1.7\n'].map((c) => c.charCodeAt(0))
const ftyp = (major: string, ...compat: string[]) => {
  const brands = [major, ...compat]
  const size = 16 + brands.length * 4 - 4 // major + minor version + compat brands
  return [0, 0, 0, size, ...[...'ftyp'].map((c) => c.charCodeAt(0)), ...[...major].map((c) => c.charCodeAt(0)), 0, 0, 0, 0,
    ...compat.flatMap((b) => [...b].map((c) => c.charCodeAt(0)))]
}
const HEIC = ftyp('heic', 'mif1', 'heic')
const AVIF = ftyp('avif', 'mif1', 'avif')
const MZ = [0x4d, 0x5a, 0x90, 0x00, 0x03]

const data = (head: number[], size = 64): Uint8Array => {
  const out = new Uint8Array(Math.max(size, head.length))
  out.set(head)
  for (let i = head.length; i < out.length; i++) out[i] = i & 0xff
  return out
}
interface Up { name: string; bytes: Uint8Array; type?: string }
const png = (name = 'a.png', size = 64): Up => ({ name, bytes: data(PNG, size), type: 'image/png' })

const recipeBody = { title: 'With files', timeTag: 'Around 1 hr', categories: ['Chicken'] }
const form = (recipe: Record<string, unknown>, files: Up[]): FormData => {
  const fd = new FormData()
  fd.set('recipe', JSON.stringify(recipe))
  for (const f of files) fd.append('files', new File([f.bytes], f.name, { type: f.type ?? '' }))
  return fd
}
const sendForm = (cookie: string, method: string, path: string, fd: FormData, e: AppEnv = baseEnv) =>
  call(path, { method, headers: { cookie, ...CSRF_HEADERS }, body: fd }, e)
const createWith = (cookie: string, files: Up[], over: Record<string, unknown> = {}, e?: AppEnv) =>
  sendForm(cookie, 'POST', '/api/recipes', form({ ...recipeBody, ...over }, files), e)
const editWith = (cookie: string, id: string, files: Up[], over: Record<string, unknown> = {}, e?: AppEnv) =>
  sendForm(cookie, 'PUT', `/api/recipes/${id}`, form({ ...recipeBody, ...over }, files), e)
const sendJson = (cookie: string, method: string, path: string, body?: unknown, e: AppEnv = baseEnv) =>
  call(path, {
    method,
    headers: { cookie, 'content-type': 'application/json', ...(method === 'GET' ? {} : CSRF_HEADERS) },
    body: body === undefined ? undefined : JSON.stringify(body),
  }, e)

interface FileView { id: string; name: string; contentType: string; size: number; url: string }
interface Recipe { id: string; hasFiles: boolean; files: FileView[]; ownerId: string }
const recipeOf = async (res: Response) => ((await res.json()) as { recipe: Recipe }).recipe
const errOf = async (res: Response) => ((await res.json()) as { error: { code: string; message: string } }).error
const count = async (table: string) =>
  (await baseEnv.DB.prepare(`SELECT COUNT(*) AS c FROM ${table}`).first<{ c: number }>())!.c
const objects = async () => (await baseEnv.FILES.list()).objects.length
const nothingStored = async () => {
  expect(await count('recipes')).toBe(0)
  expect(await count('recipe_files')).toBe(0)
  expect(await objects()).toBe(0)
}

type Put = AppEnv['FILES']['put']
const bucketWith = (over: Record<string, unknown>): AppEnv['FILES'] => ({
  put: (...a: Parameters<Put>) => baseEnv.FILES.put(...a),
  get: (...a: Parameters<AppEnv['FILES']['get']>) => baseEnv.FILES.get(...a),
  delete: (...a: Parameters<AppEnv['FILES']['delete']>) => baseEnv.FILES.delete(...a),
  list: (...a: Parameters<AppEnv['FILES']['list']>) => baseEnv.FILES.list(...a),
  head: (...a: Parameters<AppEnv['FILES']['head']>) => baseEnv.FILES.head(...a),
  ...over,
}) as unknown as AppEnv['FILES']
const withEnv = (extra: Partial<AppEnv>): AppEnv => ({ DB: baseEnv.DB, FILES: baseEnv.FILES, ...extra })

/** Seeds a recipe with files directly (bypasses limits, so caps can be set up cheaply). */
async function seed(userId: string, recipeId: string, sizes: number[]) {
  const now = Date.now()
  await baseEnv.DB.prepare(
    "INSERT INTO recipes (id, user_id, title, time_tag, notes, created_at, updated_at) VALUES (?, ?, 'Seed', 'Around 1 hr', 'n', ?, ?)",
  ).bind(recipeId, userId, now, now).run()
  await baseEnv.DB.prepare("INSERT INTO recipe_categories (recipe_id, category) VALUES (?, 'Fish')").bind(recipeId).run()
  for (const [i, size] of sizes.entries()) {
    await baseEnv.DB.prepare(
      "INSERT INTO recipe_files (id, recipe_id, user_id, r2_key, original_name, content_type, size, created_at) VALUES (?, ?, ?, ?, 'seed.png', 'image/png', ?, ?)",
    ).bind(`${recipeId}-f${i}`, recipeId, userId, `recipes/${recipeId}/${recipeId}-f${i}`, size, now).run()
  }
}

describe('content sniffing', () => {
  it.each([
    ['PDF', PDF, 'application/pdf', 'a.pdf'],
    ['PNG', PNG, 'image/png', 'a.png'],
    ['JPEG', JPEG, 'image/jpeg', 'a.jpg'],
    ['HEIC (heic brand)', HEIC, 'image/heic', 'a.heic'],
    ['HEIC (mif1 major with heic compatible)', ftyp('mif1', 'heic'), 'image/heic', 'a.heic'],
    ['HEIC (heix)', ftyp('heix'), 'image/heic', 'a.heic'],
  ])('accepts %s by content and stores the sniffed type', async (_n, head, type, name) => {
    const { cookie } = await signIn()
    const res = await createWith(cookie, [{ name, bytes: data(head), type: 'application/octet-stream' }])
    expect(res.status).toBe(201)
    const r = await recipeOf(res)
    expect(r.files[0]).toMatchObject({ name, contentType: type, size: 64 })
    expect(await objects()).toBe(1)
  })

  it('ignores the filename and declared type: a PNG called .pdf is stored as image/png', async () => {
    const { cookie } = await signIn()
    const r = await recipeOf(await createWith(cookie, [{ name: 'photo.pdf', bytes: data(PNG), type: 'application/pdf' }]))
    expect(r.files[0].contentType).toBe('image/png')
  })

  it.each([
    ['an exe renamed .png with an image type', { name: 'evil.png', bytes: data(MZ), type: 'image/png' }],
    ['a text file called .pdf', { name: 'x.pdf', bytes: new TextEncoder().encode('hello, not a pdf'), type: 'application/pdf' }],
    ['an HTML file called .jpg', { name: 'x.jpg', bytes: new TextEncoder().encode('<html><script>1</script>'), type: 'image/jpeg' }],
    ['an AVIF (generic HEIF brand, no HEIC brand)', { name: 'x.heic', bytes: data(AVIF), type: 'image/heic' }],
    ['an empty file', { name: 'x.png', bytes: new Uint8Array(0), type: 'image/png' }],
    ['a PNG signature cut short', { name: 'x.png', bytes: data(PNG.slice(0, 5), 5), type: 'image/png' }],
    ['a WebP', { name: 'x.png', bytes: data([...'RIFF'].map((c) => c.charCodeAt(0)).concat([0, 0, 0, 0], [...'WEBP'].map((c) => c.charCodeAt(0)))), type: 'image/png' }],
  ])('rejects %s and stores nothing', async (_n, up: Up) => {
    const { cookie } = await signIn()
    const res = await createWith(cookie, [up])
    expect(res.status).toBe(400)
    expect(res.headers.get('content-type')).toContain('application/json')
    const e = await errOf(res)
    expect(e.code).toBe('file_type_not_allowed')
    expect(e.message).toContain('PDF, PNG, JPG or HEIC')
    await nothingStored()
  })

  it('stores HEIC bytes unchanged and serves them back identically', async () => {
    const { cookie } = await signIn()
    const bytes = data(HEIC, 5000)
    const r = await recipeOf(await createWith(cookie, [{ name: 'IMG_1.HEIC', bytes }]))
    const res = await sendJson(cookie, 'GET', r.files[0].url)
    expect(res.headers.get('content-type')).toBe('image/heic')
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(bytes)
  })
})

describe('file limits', () => {
  it('refuses a sixth file (and 5 is fine)', async () => {
    const { cookie } = await signIn()
    const six = Array.from({ length: 6 }, (_, i) => png(`${i}.png`))
    const res = await createWith(cookie, six)
    expect(res.status).toBe(400)
    expect((await errOf(res)).code).toBe('too_many_files')
    await nothingStored()
    expect((await createWith(cookie, six.slice(0, 5))).status).toBe(201)
  })

  it('refuses a file over 10 MB, accepts exactly 10 MB', async () => {
    const { cookie } = await signIn()
    const res = await createWith(cookie, [png('big.png', 10 * MIB + 1)])
    expect(res.status).toBe(413)
    const e = await errOf(res)
    expect(e).toEqual({ code: 'file_too_large', message: 'big.png is larger than 10 MB. Choose a smaller file.' })
    await nothingStored()
    expect((await createWith(cookie, [png('ok.png', 10 * MIB)])).status).toBe(201)
  })

  it('refuses three 9 MB files (over 25 MB), accepts 10 + 10 + 5', async () => {
    const { cookie } = await signIn()
    const res = await createWith(cookie, [png('1.png', 9 * MIB), png('2.png', 9 * MIB), png('3.png', 9 * MIB)])
    expect(res.status).toBe(413)
    expect((await errOf(res)).code).toBe('recipe_files_too_large')
    await nothingStored()
    expect((await createWith(cookie, [png('1.png', 10 * MIB), png('2.png', 10 * MIB), png('3.png', 5 * MIB)])).status).toBe(201)
  })

  it('refuses a body whose declared length is over the limit before reading it', async () => {
    const { cookie } = await signIn()
    const res = await call('/api/recipes', {
      method: 'POST',
      headers: { cookie, ...CSRF_HEADERS, 'content-length': String(30 * MIB) },
      body: form(recipeBody, [png()]),
    })
    expect(res.status).toBe(413)
    expect((await errOf(res)).code).toBe('recipe_files_too_large')
    await nothingStored()
  })

  it('cuts off a streamed body with no declared length once it passes the limit', async () => {
    const { cookie } = await signIn()
    const chunk = new Uint8Array(MIB)
    let sent = 0
    const body = new ReadableStream<Uint8Array>({
      pull(c) { if (sent++ < 40) c.enqueue(chunk); else c.close() },
    })
    const res = await call('/api/recipes', {
      method: 'POST',
      headers: { cookie, ...CSRF_HEADERS, 'content-type': 'multipart/form-data; boundary=xyz' },
      body,
      duplex: 'half',
    } as RequestInit)
    expect(res.status).toBe(413)
    expect((await errOf(res)).code).toBe('recipe_files_too_large')
    await nothingStored()
  })

  it('400s on a multipart body with no recipe field, or with a file in the recipe field slot', async () => {
    const { cookie } = await signIn()
    const noRecipe = new FormData()
    noRecipe.append('files', new File([data(PNG)], 'a.png'))
    const res = await sendForm(cookie, 'POST', '/api/recipes', noRecipe)
    expect(res.status).toBe(400)
    expect((await errOf(res)).code).toBe('invalid_upload')
    const stringFile = form(recipeBody, [])
    stringFile.append('files', 'not a file')
    expect((await errOf(await sendForm(cookie, 'POST', '/api/recipes', stringFile))).code).toBe('invalid_upload')
    const badJson = new FormData()
    badJson.set('recipe', '{nope')
    expect((await errOf(await sendForm(cookie, 'POST', '/api/recipes', badJson))).code).toBe('invalid_json')
    await nothingStored()
  })

  it('applies field validation to multipart too (nothing stored, no R2 objects)', async () => {
    const { cookie } = await signIn()
    const res = await createWith(cookie, [png()], { title: '' })
    expect(res.status).toBe(400)
    expect((await errOf(res)).code).toBe('validation_failed')
    await nothingStored()
  })

  it('sanitises the stored name', async () => {
    const { cookie } = await signIn()
    const r = await recipeOf(await createWith(cookie, [png('..\\..\\etc/pass"wd\u202e\u200b<x>.png')]))
    expect(r.files[0].name).toBe('pass_wd_x_.png')
    const long = await recipeOf(await createWith(cookie, [png(`${'a'.repeat(300)}.png`)]))
    expect(long.files[0].name).toHaveLength(100)
    expect(long.files[0].name.endsWith('.png')).toBe(true)
  })
})

describe('all or nothing', () => {
  it('one bad file among good ones: no recipe, no file rows, no R2 objects', async () => {
    const { cookie } = await signIn()
    const res = await createWith(cookie, [png('1.png'), { name: 'bad.png', bytes: data(MZ) }, png('3.png')])
    expect(res.status).toBe(400)
    await nothingStored()
  })

  it('a failed R2 write part-way removes the objects already written and creates no recipe', async () => {
    const { cookie } = await signIn()
    let n = 0
    const FILES = bucketWith({
      put: async (...a: Parameters<Put>) => {
        if (++n === 2) throw new Error('boom')
        return baseEnv.FILES.put(...a)
      },
    })
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await createWith(cookie, [png('1.png'), png('2.png'), png('3.png')], {}, withEnv({ FILES }))
    expect(res.status).toBe(503)
    expect((await errOf(res)).code).toBe('storage_unavailable')
    expect(spy).toHaveBeenCalled()
    await nothingStored()
  })

  it('a cap that fills between the check and the commit rolls everything back (create)', async () => {
    const a = await signIn({ sub: 'a' })
    const env2 = withEnv({ MAX_USER_STORAGE_BYTES: String(2 * MIB) })
    const FILES = bucketWith({
      // A competing upload lands while this one is being written.
      put: async (...p: Parameters<Put>) => {
        await seed(a.userId, 'racer', [2 * MIB])
        return baseEnv.FILES.put(...p)
      },
    })
    const res = await createWith(a.cookie, [png('1.png', MIB)], {}, { ...env2, FILES })
    expect(res.status).toBe(409)
    expect((await errOf(res)).code).toBe('user_storage_limit_reached')
    expect(await count('recipes')).toBe(1) // only the racer
    expect(await count('recipe_files')).toBe(1)
    expect(await count('recipe_categories')).toBe(1)
    expect(await objects()).toBe(0)
  })

  it('a failing edit leaves the recipe, its files and its objects untouched', async () => {
    const { cookie } = await signIn()
    const r = await recipeOf(await createWith(cookie, [png('keep.png')], { notes: 'orig' }))
    const res = await editWith(cookie, r.id, [{ name: 'bad.png', bytes: data(MZ) }], { title: 'Changed', notes: 'changed' })
    expect(res.status).toBe(400)
    const after = await recipeOf(await sendJson(cookie, 'GET', `/api/recipes/${r.id}`))
    expect(after).toMatchObject({ title: 'With files', notes: 'orig' } as unknown as Recipe)
    expect(after.files.map((f) => f.id)).toEqual([r.files[0].id])
    expect(await objects()).toBe(1)
  })

  it('a recipe-cap refusal on create with files stores no objects', async () => {
    const { cookie, userId } = await signIn()
    await seed(userId, 's1', [])
    const res = await createWith(cookie, [png()], {}, withEnv({ MAX_USER_RECIPES: '1' }))
    expect(res.status).toBe(409)
    expect((await errOf(res)).code).toBe('recipe_limit_reached')
    expect(await objects()).toBe(0)
  })
})

describe('storage caps', () => {
  it('per-user cap: message derives the number from config; nothing stored; other users unaffected', async () => {
    const a = await signIn({ sub: 'a' })
    const b = await signIn({ sub: 'b', email: 'b@example.com' })
    const small = withEnv({ MAX_USER_STORAGE_BYTES: String(2 * MIB) })
    expect((await createWith(a.cookie, [png('1.png', MIB)], {}, small)).status).toBe(201)
    expect((await createWith(a.cookie, [png('2.png', MIB)], {}, small)).status).toBe(201)
    const res = await createWith(a.cookie, [png('3.png', 1)], {}, small)
    expect(res.status).toBe(409)
    expect(await errOf(res)).toEqual({
      code: 'user_storage_limit_reached',
      message: 'You have reached your 2 MB upload limit. Delete a file or recipe you no longer need, then try again.',
    })
    expect(await count('recipes')).toBe(2)
    expect(await objects()).toBe(2)
    expect((await createWith(b.cookie, [png('b.png', MIB)], {}, small)).status).toBe(201)
  })

  it('per-user cap defaults to 100 MB', async () => {
    const { cookie, userId } = await signIn()
    await seed(userId, 's1', Array(5).fill(10 * MIB))
    await seed(userId, 's2', Array(5).fill(10 * MIB))
    const res = await createWith(cookie, [png('x.png', 1)])
    expect(res.status).toBe(409)
    expect((await errOf(res)).message).toBe(
      'You have reached your 100 MB upload limit. Delete a file or recipe you no longer need, then try again.',
    )
  })

  it('global cap: exact message; text-only recipes are not blocked', async () => {
    const a = await signIn({ sub: 'a' })
    const b = await signIn({ sub: 'b', email: 'b@example.com' })
    const tiny = withEnv({ MAX_TOTAL_STORAGE_BYTES: String(2 * MIB) })
    expect((await createWith(a.cookie, [png('1.png', 2 * MIB)], {}, tiny)).status).toBe(201)
    const res = await createWith(b.cookie, [png('2.png', 1)], {}, tiny)
    expect(res.status).toBe(409)
    expect(await errOf(res)).toEqual({
      code: 'storage_full',
      message: "The app's shared storage is full, so this file could not be saved. Ask the owner to free up space.",
    })
    expect(await count('recipes')).toBe(1)
    const text = await sendJson(b.cookie, 'POST', '/api/recipes', { ...recipeBody, notes: 'text only' }, tiny)
    expect(text.status).toBe(201)
    const edit = await recipeOf(text)
    expect((await sendJson(b.cookie, 'PUT', `/api/recipes/${edit.id}`, { ...recipeBody, notes: 'still ok' }, tiny)).status).toBe(200)
  })

  it('byte caps with more than nine digits are read (junk falls back to the default)', () => {
    expect(positiveInt('5368709120', 1, 15)).toBe(5368709120)
    expect(positiveInt('5368709120', 1)).toBe(1)
    expect(positiveInt('abc', 7, 15)).toBe(7)
  })

  it('quota is freed by deleting a recipe, and a refused upload then succeeds', async () => {
    const { cookie } = await signIn()
    const small = withEnv({ MAX_USER_STORAGE_BYTES: String(2 * MIB) })
    const r = await recipeOf(await createWith(cookie, [png('1.png', 2 * MIB)], {}, small))
    expect((await createWith(cookie, [png('2.png', MIB)], {}, small)).status).toBe(409)
    expect((await sendJson(cookie, 'DELETE', `/api/recipes/${r.id}`, undefined, small)).status).toBe(200)
    expect(await objects()).toBe(0)
    expect((await createWith(cookie, [png('2.png', MIB)], {}, small)).status).toBe(201)
  })

  it('quota is freed by removing a file in an edit, in the same edit as a new file', async () => {
    const { cookie } = await signIn()
    const small = withEnv({ MAX_USER_STORAGE_BYTES: String(2 * MIB) })
    const r = await recipeOf(await createWith(cookie, [png('1.png', 2 * MIB)], {}, small))
    // Add without removing: refused.
    expect((await editWith(cookie, r.id, [png('2.png', MIB)], {}, small)).status).toBe(409)
    // Remove and add together: the freed bytes count immediately.
    const res = await editWith(cookie, r.id, [png('2.png', MIB)], { removeFileIds: [r.files[0].id] }, small)
    expect(res.status).toBe(200)
    expect((await recipeOf(res)).files.map((f) => f.name)).toEqual(['2.png'])
    expect(await objects()).toBe(1)
  })
})

describe('edit', () => {
  it('adds files, keeps existing ones, lists them in order with urls', async () => {
    const { cookie } = await signIn()
    const r = await recipeOf(await createWith(cookie, [png('1.png')]))
    const e = await recipeOf(await editWith(cookie, r.id, [png('2.png'), { name: 'm.pdf', bytes: data(PDF) }]))
    expect(e.files.map((f) => f.name)).toEqual(['1.png', '2.png', 'm.pdf'])
    expect(e.files[0].id).toBe(r.files[0].id)
    expect(e.files[2]).toMatchObject({ contentType: 'application/pdf', url: `/api/recipes/${r.id}/files/${e.files[2].id}` })
    expect(e.hasFiles).toBe(true)
    expect(await objects()).toBe(3)
  })

  it('removes a file (JSON edit) and deletes its R2 object after the commit', async () => {
    const { cookie } = await signIn()
    const r = await recipeOf(await createWith(cookie, [png('1.png'), png('2.png')]))
    const res = await sendJson(cookie, 'PUT', `/api/recipes/${r.id}`, { ...recipeBody, removeFileIds: [r.files[0].id] })
    expect(res.status).toBe(200)
    expect((await recipeOf(res)).files.map((f) => f.name)).toEqual(['2.png'])
    expect(await objects()).toBe(1)
    expect((await sendJson(cookie, 'GET', r.files[0].url)).status).toBe(404)
  })

  it('existing files count towards 5 files and 25 MB', async () => {
    const { cookie } = await signIn()
    const four = await recipeOf(await createWith(cookie, Array.from({ length: 4 }, (_, i) => png(`${i}.png`))))
    const res = await editWith(cookie, four.id, [png('a.png'), png('b.png')])
    expect(res.status).toBe(400)
    expect((await errOf(res)).code).toBe('too_many_files')
    expect((await editWith(cookie, four.id, [png('a.png')])).status).toBe(200)

    const big = await recipeOf(await createWith(cookie, [png('1.png', 10 * MIB), png('2.png', 10 * MIB)]))
    const over = await editWith(cookie, big.id, [png('3.png', 6 * MIB)])
    expect(over.status).toBe(413)
    expect((await errOf(over)).code).toBe('recipe_files_too_large')
    expect((await editWith(cookie, big.id, [png('3.png', 5 * MIB)])).status).toBe(200)
  })

  it('content rule counts files remaining after the edit', async () => {
    const { cookie } = await signIn()
    const r = await recipeOf(await createWith(cookie, [png('1.png'), png('2.png')]))
    // A file-only recipe (no link, no notes) can be edited while it keeps a file.
    expect((await editWith(cookie, r.id, [], { title: 'Renamed' })).status).toBe(200)
    expect((await sendJson(cookie, 'PUT', `/api/recipes/${r.id}`, { ...recipeBody, removeFileIds: [r.files[0].id] })).status).toBe(200)
    // Removing the last file of a file-only recipe is refused and nothing changes.
    const res = await sendJson(cookie, 'PUT', `/api/recipes/${r.id}`, { ...recipeBody, title: 'Nope', removeFileIds: [r.files[1].id] })
    expect(res.status).toBe(400)
    expect((await errOf(res)).code).toBe('validation_failed')
    const after = await recipeOf(await sendJson(cookie, 'GET', `/api/recipes/${r.id}`))
    expect(after.files).toHaveLength(1)
    expect(await objects()).toBe(1)
    // Removing it while adding a replacement is fine.
    expect((await editWith(cookie, r.id, [png('new.png')], { removeFileIds: [r.files[1].id] })).status).toBe(200)
    // Or while supplying notes.
    expect((await sendJson(cookie, 'PUT', `/api/recipes/${r.id}`, { ...recipeBody, notes: 'now notes', removeFileIds: [(await recipeOf(await sendJson(cookie, 'GET', `/api/recipes/${r.id}`))).files[0].id] })).status).toBe(200)
  })

  it('create with files and no link or notes is accepted; with nothing it is refused', async () => {
    const { cookie } = await signIn()
    expect((await createWith(cookie, [png()])).status).toBe(201)
    const res = await createWith(cookie, [])
    expect(res.status).toBe(400)
    expect((await errOf(res)).code).toBe('validation_failed')
  })

  it('cannot remove a file that belongs to another recipe, or an unknown id', async () => {
    const { cookie } = await signIn()
    const a = await recipeOf(await createWith(cookie, [png('a.png')]))
    const b = await recipeOf(await createWith(cookie, [png('b.png')]))
    for (const ids of [[b.files[0].id], ['nope'], [a.files[0].id, 'nope']]) {
      const res = await sendJson(cookie, 'PUT', `/api/recipes/${a.id}`, { ...recipeBody, notes: 'x', removeFileIds: ids })
      expect(res.status).toBe(400)
    }
    expect((await sendJson(cookie, 'PUT', `/api/recipes/${a.id}`, { ...recipeBody, notes: 'x', removeFileIds: 'a' })).status).toBe(400)
    expect(await count('recipe_files')).toBe(2)
    expect(await objects()).toBe(2)
  })

  it('a failed R2 delete after an edit is logged and the edit still succeeds', async () => {
    const { cookie } = await signIn()
    const r = await recipeOf(await createWith(cookie, [png('1.png'), png('2.png')]))
    const FILES = bucketWith({ delete: async () => { throw new Error('r2 down') } })
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await sendJson(cookie, 'PUT', `/api/recipes/${r.id}`, { ...recipeBody, removeFileIds: [r.files[0].id] }, withEnv({ FILES }))
    expect(res.status).toBe(200)
    expect((await recipeOf(res)).files).toHaveLength(1)
    expect(spy).toHaveBeenCalledWith('R2 delete failed; objects may be orphaned', expect.objectContaining({ keys: [`recipes/${r.id}/${r.files[0].id}`] }))
  })
})

describe('ownership', () => {
  it('a non-owner gets 403 on adding, removing and deleting; nothing changes', async () => {
    const a = await signIn({ sub: 'a' })
    const b = await signIn({ sub: 'b', email: 'b@example.com' })
    const r = await recipeOf(await createWith(a.cookie, [png('a.png')]))
    const add = await editWith(b.cookie, r.id, [png('evil.png')])
    expect(add.status).toBe(403)
    expect((await sendJson(b.cookie, 'PUT', `/api/recipes/${r.id}`, { ...recipeBody, notes: 'x', removeFileIds: [r.files[0].id] })).status).toBe(403)
    expect((await sendJson(b.cookie, 'DELETE', `/api/recipes/${r.id}`)).status).toBe(403)
    expect(await count('recipe_files')).toBe(1)
    expect(await objects()).toBe(1)
    // Anyone signed in may still view the file.
    expect((await sendJson(b.cookie, 'GET', r.files[0].url)).status).toBe(200)
  })
})

describe('delete', () => {
  it('removes the recipe, file rows and R2 objects; the file URL then 404s', async () => {
    const { cookie } = await signIn()
    const r = await recipeOf(await createWith(cookie, [png('1.png'), png('2.png')]))
    expect((await sendJson(cookie, 'DELETE', `/api/recipes/${r.id}`)).status).toBe(200)
    expect(await count('recipe_files')).toBe(0)
    expect(await objects()).toBe(0)
    const res = await sendJson(cookie, 'GET', r.files[0].url)
    expect(res.status).toBe(404)
    expect((await errOf(res)).code).toBe('not_found')
  })

  it('an R2 failure is logged and the user still sees the recipe deleted', async () => {
    const { cookie } = await signIn()
    const r = await recipeOf(await createWith(cookie, [png('1.png')]))
    const FILES = bucketWith({ delete: async () => { throw new Error('r2 down') } })
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await sendJson(cookie, 'DELETE', `/api/recipes/${r.id}`, undefined, withEnv({ FILES }))
    expect(res.status).toBe(200)
    expect(spy).toHaveBeenCalledWith('R2 delete failed; objects may be orphaned', expect.objectContaining({
      reason: 'recipe deleted', keys: [`recipes/${r.id}/${r.files[0].id}`],
    }))
    expect((await sendJson(cookie, 'GET', `/api/recipes/${r.id}`)).status).toBe(404)
    // The object is orphaned but unreachable through the app.
    expect(await objects()).toBe(1)
    expect((await sendJson(cookie, 'GET', r.files[0].url)).status).toBe(404)
  })
})

describe('file route', () => {
  it('401 without a session, whatever the ids', async () => {
    const { cookie } = await signIn()
    const r = await recipeOf(await createWith(cookie, [png()]))
    expect((await call(r.files[0].url)).status).toBe(401)
    expect((await call(r.files[0].url, { headers: { cookie: 'session=bogus' } })).status).toBe(401)
    expect((await call('/api/recipes/nope/files/nope')).status).toBe(401)
  })

  it('serves the stored type with safe headers, inline by default, attachment on ?download=1', async () => {
    const { cookie } = await signIn()
    const bytes = data(PDF, 2000)
    const r = await recipeOf(await createWith(cookie, [{ name: 'Grandma’s "pie".pdf', bytes, type: 'text/html' }]))
    const res = await sendJson(cookie, 'GET', r.files[0].url)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('application/pdf')
    expect(res.headers.get('x-content-type-options')).toBe('nosniff')
    expect(res.headers.get('cache-control')).toBe('private, no-cache')
    expect(res.headers.get('content-length')).toBe('2000')
    const cd = res.headers.get('content-disposition')!
    expect(cd.startsWith('inline;')).toBe(true)
    expect(cd).toContain("filename*=UTF-8''Grandma%E2%80%99s%20_pie_.pdf")
    expect(cd).not.toMatch(/[\r\n]/)
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(bytes)
    const dl = await sendJson(cookie, 'GET', `${r.files[0].url}?download=1`)
    expect(dl.headers.get('content-disposition')!.startsWith('attachment;')).toBe(true)
  })

  it('404 for an unknown file, a file under the wrong recipe, and a missing R2 object', async () => {
    const { cookie } = await signIn()
    const a = await recipeOf(await createWith(cookie, [png('a.png')]))
    const b = await recipeOf(await createWith(cookie, [png('b.png')]))
    expect((await sendJson(cookie, 'GET', `/api/recipes/${a.id}/files/nope`)).status).toBe(404)
    expect((await sendJson(cookie, 'GET', `/api/recipes/${b.id}/files/${a.files[0].id}`)).status).toBe(404)
    expect((await sendJson(cookie, 'GET', `/api/recipes/${a.id}/files/${a.files[0].id}/x`)).status).toBe(404)
    await baseEnv.FILES.delete(`recipes/${a.id}/${a.files[0].id}`)
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect((await sendJson(cookie, 'GET', a.files[0].url)).status).toBe(404)
  })

  it('only GET is routed, and uploads need the CSRF headers', async () => {
    const { cookie } = await signIn()
    const r = await recipeOf(await createWith(cookie, [png()]))
    expect((await sendJson(cookie, 'DELETE', r.files[0].url)).status).toBe(404)
    const noCsrf = await call('/api/recipes', { method: 'POST', headers: { cookie, origin: ORIGIN }, body: form(recipeBody, [png()]) })
    expect(noCsrf.status).toBe(403)
    expect(await count('recipes')).toBe(1)
    expect(await objects()).toBe(1)
  })
})

describe('responses and rate limit', () => {
  it('list reports hasFiles per recipe without file detail; detail has files', async () => {
    const { cookie } = await signIn()
    const withFile = await recipeOf(await createWith(cookie, [png()]))
    const text = await recipeOf(await sendJson(cookie, 'POST', '/api/recipes', { ...recipeBody, notes: 'n' }))
    const list = ((await (await sendJson(cookie, 'GET', '/api/recipes')).json()) as { recipes: (Recipe & { files?: unknown })[] }).recipes
    expect(list.find((x) => x.id === withFile.id)!.hasFiles).toBe(true)
    expect(list.find((x) => x.id === text.id)!.hasFiles).toBe(false)
    expect(list[0].files).toBeUndefined()
    expect(text.files).toEqual([])
    expect(withFile.files[0]).toEqual({
      id: expect.any(String), name: 'a.png', contentType: 'image/png', size: 64,
      url: expect.stringMatching(new RegExp(`^/api/recipes/${withFile.id}/files/`)),
    })
  })

  it('a multi-file request is one write for the rate limit', async () => {
    const { cookie } = await signIn()
    const one = withEnv({ WRITE_RATE_PER_MINUTE: '1' })
    expect((await createWith(cookie, [png('1.png'), png('2.png'), png('3.png')], {}, one)).status).toBe(201)
    const res = await createWith(cookie, [png('4.png')], {}, one)
    expect(res.status).toBe(429)
    expect((await errOf(res)).code).toBe('rate_limited')
    expect(await count('recipes')).toBe(1)
    expect(await objects()).toBe(3)
  })
})
