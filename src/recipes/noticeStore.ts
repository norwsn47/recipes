import { useSyncExternalStore } from 'react'
import { createNoticeStore } from '../lib/notice'
import { shareRecipe } from '../lib/share'

/** The one app-wide notice, shared by favourites and sharing. */
export const notice = createNoticeStore()

export function useNotice() {
  return useSyncExternalStore(notice.subscribe, notice.get)
}

/** Share a recipe using the real browser. */
export function share(recipe: { id: string; title: string }): Promise<void> {
  return shareRecipe(recipe, { origin: location.origin, nav: navigator as unknown as Parameters<typeof shareRecipe>[1]['nav'], notice })
}
