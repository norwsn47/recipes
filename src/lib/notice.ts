// One short message at a time, shown by the shared Notice component on the list and the recipe
// page. A new message replaces the old. Free of DOM and React so it can be unit tested.

export interface NoticeState {
  message: string
  /** Stays until dismissed or replaced, instead of fading after a few seconds. */
  persist: boolean
  /** Who set it, so a feature can clear only its own message. Empty when untagged. */
  source: string
}

const EMPTY: NoticeState = { message: '', persist: false, source: '' }

export function createNoticeStore() {
  let state = EMPTY
  const listeners = new Set<() => void>()
  const set = (next: NoticeState) => {
    state = next
    listeners.forEach((l) => l())
  }
  return {
    show(message: string, options: { persist?: boolean; source?: string } = {}) {
      set({ message, persist: options.persist === true, source: options.source ?? '' })
    },
    /** Clears the message. With a source, clears only a message that source set. */
    clear(source?: string) {
      if (!state.message) return
      if (source !== undefined && state.source !== source) return
      set(EMPTY)
    },
    /** Clears only if `snapshot` is still the current message (the same object from `get`). */
    clearIf(snapshot: NoticeState) {
      if (state.message && state === snapshot) set(EMPTY)
    },
    /** A stable snapshot: a new object only when a message is shown or cleared. */
    get: () => state,
    subscribe(l: () => void) {
      listeners.add(l)
      return () => {
        listeners.delete(l)
      }
    },
  }
}

export type NoticeStore = ReturnType<typeof createNoticeStore>
