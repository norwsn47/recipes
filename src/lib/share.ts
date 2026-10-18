// Sharing a recipe: the native share sheet where there is one, otherwise copy the link, and as a
// last resort show the link so it can be copied by hand. The environment is read at call time
// (and can be injected), so this is free of the DOM at import and can be unit tested.

export const LINK_COPIED = 'Link copied'
export const copyByHand = (url: string) => `Copy this link: ${url}`

export interface ShareEnv {
  origin: string
  nav: {
    share?: (data: { title: string; url: string }) => Promise<void>
    clipboard?: { writeText(text: string): Promise<void> }
  } | undefined
  notice: {
    show(message: string, options?: { persist?: boolean }): void
  }
}

export function shareUrl(origin: string, id: string): string {
  return `${origin}/r/${id}`
}

function isAbort(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { name?: unknown }).name === 'AbortError'
}

export async function shareRecipe(recipe: { id: string; title: string }, env: ShareEnv): Promise<void> {
  const url = shareUrl(env.origin, recipe.id)
  const nav = env.nav
  if (typeof nav?.share === 'function') {
    try {
      await nav.share({ title: recipe.title, url })
      return
    } catch (err) {
      if (isAbort(err)) return
      // Any other failure falls through to copying the link.
    }
  }
  try {
    if (!nav?.clipboard) throw new Error('no clipboard')
    await nav.clipboard.writeText(url)
    env.notice.show(LINK_COPIED)
  } catch {
    // Stays until dismissed: a vanishing link cannot be copied.
    env.notice.show(copyByHand(url), { persist: true })
  }
}
