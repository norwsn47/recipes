import { useSyncExternalStore } from 'react'
import { createFavouritesStore } from '../lib/favourites'
import { ApiError, setFavourite } from '../lib/recipes'

export const FAVOURITE_FAILED = 'Could not update your favourites. Try again.'

export const favourites = createFavouritesStore({
  send: setFavourite,
  messageFor: (err) => {
    if (err instanceof ApiError) {
      if (err.status === 401) return null // the sign-in overlay takes over
      if (err.status === 429) return err.message
    }
    return FAVOURITE_FAILED
  },
})

/** The shown favourite state for a recipe, plus a toggle. `fromServer` is the value from the latest fetch. */
export function useFavourite(id: string, fromServer: boolean): [boolean, () => void] {
  useSyncExternalStore(favourites.subscribe, favourites.getVersion)
  return [favourites.get(id, fromServer), () => favourites.toggle(id, fromServer)]
}

export function useFavouriteNotice(): string {
  useSyncExternalStore(favourites.subscribe, favourites.getVersion)
  return favourites.getNotice()
}
