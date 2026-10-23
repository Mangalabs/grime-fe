import { useEffect, useState, type ReactNode } from 'react'
import './Toast.css'
import { CloseIcon } from './icons'

interface ToastProps {
  children: ReactNode
  actionLabel?: string
  actionShortcut?: string
  onAction?: () => void
  onDismiss: () => void
  durationMs?: number
}

/**
 * A short-lived message at the bottom of the screen. The countdown pauses
 * while the pointer or focus is on it, so an action can't vanish mid-reach.
 */
export function Toast({
  children,
  actionLabel,
  actionShortcut,
  onAction,
  onDismiss,
  durationMs = 10000,
}: ToastProps) {
  const [isPaused, setIsPaused] = useState(false)

  useEffect(() => {
    if (isPaused) return
    const timer = window.setTimeout(onDismiss, durationMs)
    return () => window.clearTimeout(timer)
  }, [isPaused, durationMs, onDismiss])

  return (
    <div
      className="toast"
      role="status"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setIsPaused(false)
      }}
      onFocus={() => setIsPaused(true)}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      <p>{children}</p>
      {actionLabel && onAction && (
        <button
          aria-keyshortcuts={actionShortcut}
          className="toast-action"
          type="button"
          onClick={onAction}
        >
          {actionLabel}
          {actionShortcut && <kbd>{actionShortcut.replace('Control', 'Ctrl')}</kbd>}
        </button>
      )}
      <button aria-label="Fechar aviso" className="toast-close" type="button" onClick={onDismiss}>
        <CloseIcon />
      </button>
      {!isPaused && (
        <span
          aria-hidden="true"
          className="toast-countdown"
          style={{ animationDuration: `${durationMs}ms` }}
        />
      )}
    </div>
  )
}
