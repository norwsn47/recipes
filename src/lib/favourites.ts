// Optimistic favourite state, shared by the list and the recipe view so they never disagree.
// Per recipe: the heart flips at once; while a request is in flight further taps only record the
// wanted state, and when the request returns one more is sent if it differs from the confirmed
// state, so the final state equals the last tap. On failure the heart returns to the last
// confirmed server state. Free of DOM and React so it can be unit tested.

interface Entry {
  /** Last state the server confirmed (or the state shown when the first tap happened). */
  confirmed: boolean
  /** What the user last asked for. */
  desired: boolean
  inflight: boolean
  /** Logical time of the last change, so older list fetches cannot overwrite it. */
  tick: number
}

export interface FavouritesConfig {
  send(id: string, on: boolean): Promise<boolean>
  /** The message to show for a failed call, or null to show none (for example a 401, which re-prompts sign-in). */
  messageFor(err: unknown): string | null
  /** Called when a failure message is set, or with '' when the store clears it on a new tap or reset. */
  onNotice?(message: string): void
}

export function createFavouritesStore({ send, messageFor, onNotice }: FavouritesConfig) {
  const entries = new Map<string, Entry>()
  const listeners = new Set<() => void>()
  let tick = 0
  let version = 0
  let notice = ''
  /** Bumped by reset(); a request that settles under an older generation is ignored. */
  let generation = 0

  const emit = () => {
    version++
    listeners.forEach((l) => l())
  }

  async function run(id: string) {
    const e = entries.get(id)
    if (!e) return
    const gen = generation
    try {
      const confirmed = await send(id, e.desired)
      if (gen !== generation) return
      e.confirmed = confirmed
      e.tick = ++tick
      if (e.desired !== confirmed) {
        emit()
        void run(id)
        return
      }
      e.inflight = false
    } catch (err) {
      if (gen !== generation) return
      e.desired = e.confirmed
      e.inflight = false
      e.tick = ++tick
      notice = messageFor(err) ?? ''
      if (notice) onNotice?.(notice)
    }
    emit()
  }

  return {
    /** The state to show: the store's view if it has one, otherwise the value from the last fetch. */
    get(id: string, fromServer: boolean): boolean {
      const e = entries.get(id)
      if (!e) return fromServer
      return e.inflight ? e.desired : e.confirmed
    },
    toggle(id: string, fromServer: boolean) {
      const shown = this.get(id, fromServer)
      const e = entries.get(id)
      if (e?.inflight) {
        e.desired = !shown
        e.tick = ++tick
        emit()
        return
      }
      notice = ''
      entries.set(id, { confirmed: shown, desired: !shown, inflight: true, tick: ++tick })
      emit()
      void run(id)
    },
    /** Call just before starting a fetch; pass the result to `seed` when the response arrives. */
    mark(): number {
      return tick
    },
    /** A fetch that started at `startedTick` has returned: drop settled entries it is newer than, so its values win. */
    seed(id: string, startedTick: number) {
      const e = entries.get(id)
      if (e && !e.inflight && e.tick <= startedTick) {
        entries.delete(id)
        emit()
      }
    },
    /** Forget everything: for sign-out or a change of user. Late responses from before the reset are ignored. */
    reset() {
      generation++
      entries.clear()
      notice = ''
      emit()
    },
    getNotice: () => notice,
    clearNotice() {
      if (notice) {
        notice = ''
        emit()
      }
    },
    subscribe(l: () => void) {
      listeners.add(l)
      return () => {
        listeners.delete(l)
      }
    },
    getVersion: () => version,
  }
}
