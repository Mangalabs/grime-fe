import { useEffect } from 'react'

/** Calls `onClose` when Escape is pressed, while `enabled` (e.g. not while saving). */
export function useCloseOnEscape(onClose: () => void, enabled = true) {
  useEffect(() => {
    if (!enabled) return
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', close)
    return () => document.removeEventListener('keydown', close)
  }, [enabled, onClose])
}
