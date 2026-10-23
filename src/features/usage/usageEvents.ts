// Tells usage displays to reload after something may have spent words.
// Separate from the usage hook so the API client can call it without a cycle.
const listeners = new Set<() => void>()

export function notifyUsageChanged() {
  for (const listener of listeners) listener()
}

export function onUsageChanged(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
