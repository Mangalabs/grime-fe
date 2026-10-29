import { useEffect, useRef } from 'react'
import { api } from '../../api/client'

// Without a key, click, scroll or mouse move for this long, the reviewer is
// away and the time stops counting (reading a long page still scrolls).
export const IDLE_AFTER_MS = 5 * 60 * 1000
const TICK_MS = 15 * 1000
const FLUSH_EVERY_MS = 60 * 1000
// The server refuses larger increments; a sleeping laptop can't add hours.
const MAX_TICK_MS = 2 * TICK_MS

export const dayOf = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

const activityEvents = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'scroll', 'touchstart'] as const

/**
 * Counts active time on the open project, per day and pipeline stage, and
 * sends it to the server every minute. Counts only while the tab is visible
 * and the reviewer did something in the last few minutes.
 */
export function useActiveTime(projectId: string | null, stageId: string | null, enabled: boolean) {
  const lastActivity = useRef(0)
  const pending = useRef(new Map<string, { projectId: string; day: string; stageId: string; ms: number }>())

  useEffect(() => {
    if (!enabled || !projectId) return
    const project = projectId
    const stage = stageId ?? ''
    lastActivity.current = Date.now()
    let lastTick = Date.now()

    const markActive = () => {
      lastActivity.current = Date.now()
    }

    const tick = () => {
      const now = Date.now()
      const elapsed = Math.min(now - lastTick, MAX_TICK_MS)
      lastTick = now
      if (document.visibilityState !== 'visible' || now - lastActivity.current > IDLE_AFTER_MS) return
      const day = dayOf(new Date(now))
      const key = `${project}|${day}|${stage}`
      const entry = pending.current.get(key) ?? { projectId: project, day, stageId: stage, ms: 0 }
      entry.ms += elapsed
      pending.current.set(key, entry)
    }

    const flush = () => {
      tick()
      for (const [key, entry] of pending.current) {
        const seconds = Math.floor(entry.ms / 1000)
        if (seconds < 1) continue
        // Keep the remainder; a failed send stays pending for the next try.
        entry.ms -= seconds * 1000
        void api
          .recordTime(entry.projectId, { day: entry.day, stageId: entry.stageId, seconds: Math.min(seconds, 900) })
          .catch(() => {
            entry.ms += seconds * 1000
            pending.current.set(key, entry)
          })
      }
    }

    const onVisibility = () => {
      // Coming back after a while: the time away isn't counted.
      if (document.visibilityState === 'visible') lastTick = Date.now()
      else flush()
    }

    for (const name of activityEvents) window.addEventListener(name, markActive, { passive: true, capture: true })
    document.addEventListener('visibilitychange', onVisibility)
    const ticker = window.setInterval(tick, TICK_MS)
    const flusher = window.setInterval(flush, FLUSH_EVERY_MS)
    return () => {
      for (const name of activityEvents) window.removeEventListener(name, markActive, { capture: true })
      document.removeEventListener('visibilitychange', onVisibility)
      window.clearInterval(ticker)
      window.clearInterval(flusher)
      // Switching project or stage: what was counted so far goes now.
      flush()
    }
  }, [projectId, stageId, enabled])
}

export function formatDuration(seconds: number) {
  const minutes = Math.round(seconds / 60)
  if (minutes < 1) return seconds > 0 ? 'menos de 1 min' : '0 min'
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest ? `${hours} h ${String(rest).padStart(2, '0')} min` : `${hours} h`
}
