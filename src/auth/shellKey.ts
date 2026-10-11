import type { User } from '../lib/api'

/**
 * Key for the signed-in shell content. It follows the user id, so re-signing in as the same
 * person (after the session expires) keeps the route tree mounted and form state intact, while a
 * different account remounts it and the previous user's unsaved state is dropped.
 */
export function shellKey(user: Pick<User, 'id'>): string {
  return `user:${user.id}`
}
