import { useState } from 'react'
import { defaultLayout, type LayoutOptions } from './estimate'
import { costItems, type CostUnit, type FormatId } from './tables'

/**
 * The choices made for one project's printed book: the format (or none, to
 * follow the recommendation), the layout settings and the cost sheet.
 * Kept in this browser for now; nothing here is part of the manuscript.
 */
export type PriceLevel = 'min' | 'medio' | 'max'

export interface CostLine {
  enabled: boolean
  price: number
}

export interface ExtraCost {
  id: string
  name: string
  unit: CostUnit
  price: number
}

export interface ProductionPlan {
  formatId: FormatId | null
  layout: LayoutOptions
  level: PriceLevel
  costs: Record<string, CostLine>
  extras: ExtraCost[]
}

export const priceAt = (item: { min: number; max: number }, level: PriceLevel) =>
  level === 'min' ? item.min : level === 'max' ? item.max : Math.round(((item.min + item.max) / 2) * 100) / 100

export const defaultCosts = (level: PriceLevel): Record<string, CostLine> =>
  Object.fromEntries(costItems.map((item) => [item.id, { enabled: !item.optional, price: priceAt(item, level) }]))

const defaultPlan = (): ProductionPlan => ({ formatId: null, layout: defaultLayout, level: 'medio', costs: defaultCosts('medio'), extras: [] })

const storageKey = (projectId: string) => `petricor.producao.${projectId}`

function read(projectId: string): ProductionPlan {
  try {
    const stored = JSON.parse(localStorage.getItem(storageKey(projectId)) ?? 'null') as Partial<ProductionPlan> | null
    if (!stored) return defaultPlan()
    const base = defaultPlan()
    // Older or partial plans get the missing parts from the defaults.
    return {
      ...base,
      ...stored,
      layout: { ...base.layout, ...stored.layout, typography: { ...base.layout.typography, ...stored.layout?.typography } },
      costs: { ...base.costs, ...stored.costs },
      extras: Array.isArray(stored.extras) ? stored.extras : [],
    }
  } catch {
    return defaultPlan()
  }
}

export function useProductionPlan(projectId: string) {
  const [plan, setPlan] = useState(() => read(projectId))
  const update = (change: (current: ProductionPlan) => ProductionPlan) =>
    setPlan((current) => {
      const next = change(current)
      try {
        localStorage.setItem(storageKey(projectId), JSON.stringify(next))
      } catch {
        // Private window: the plan lasts as long as the page.
      }
      return next
    })
  const reset = () => update(() => defaultPlan())
  return { plan, update, reset }
}
