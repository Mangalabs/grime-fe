import { useCallback, useEffect, useState } from 'react'
import { api } from '../../api/client'
import type { UsageFeature, UsageSummary } from '../../api/contracts'
import { onUsageChanged } from './usageEvents'

// In the order an author meets them while working on a book.
export const usageFeatureOrder: UsageFeature[] = ['IMPORT', 'LINTER', 'ARCHIVIST', 'ARCHITECT', 'MARKETING']

export const usageFeatureLabels: Record<UsageFeature, string> = {
  IMPORT: 'Importador',
  LINTER: 'Revisor',
  ARCHIVIST: 'Arquivista',
  ARCHITECT: 'Arquiteto',
  MARKETING: 'Marketing',
}

export const usageFeatureDescriptions: Record<UsageFeature, string> = {
  IMPORT: 'Lê o PDF importado para encontrar onde cada cena começa.',
  LINTER: 'Lê cada cena analisada para apontar diagnósticos.',
  ARCHIVIST: 'Lê as mesmas cenas para propor fatos ao cânone.',
  ARCHITECT: 'Lê o manuscrito inteiro a cada revisão arquitetural.',
  MARKETING: 'Lê as cenas públicas e a bíblia pública para rascunhar o kit de identidade.',
}

// From this share of the allowance on, displays warn the author.
export const usageWarningShare = 0.8

export function countWords(text: string): number {
  const trimmed = text.trim()
  return trimmed ? trimmed.split(/\s+/).length : 0
}

export function formatWords(words: number): string {
  return `${words.toLocaleString('pt-BR')} ${words === 1 ? 'palavra' : 'palavras'}`
}

export function formatResetDate(resetsAt: string): string {
  return new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(
    new Date(resetsAt),
  )
}

export type UsageLevel = 'ok' | 'warning' | 'exhausted'

export function usageLevel(usage: UsageSummary): UsageLevel {
  if (usage.remaining === 0) return 'exhausted'
  return usage.used >= usage.limit * usageWarningShare ? 'warning' : 'ok'
}

// The account's usage this month, reloaded whenever an action may have spent words.
export function useUsage() {
  const [usage, setUsage] = useState<UsageSummary | null>(null)

  const reload = useCallback(() => {
    void api
      .getUsage()
      .then(setUsage)
      .catch(() => {
        // Usage is informative; the action itself reports a refusal.
      })
  }, [])

  useEffect(() => {
    reload()
    return onUsageChanged(reload)
  }, [reload])

  return { usage, reload }
}
