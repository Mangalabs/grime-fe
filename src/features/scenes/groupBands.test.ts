import { describe, expect, it } from 'vitest'
import type { SceneGroup, Slot } from '../../api/contracts'
import { groupBands } from './groups'

const scene = (id: string, groupId: string | null) => ({ id, groupId }) as Slot
const groups = [
  { id: 'g1', name: 'Ato I', color: 'amber' },
  { id: 'g2', name: 'Ato II', color: 'teal' },
] as SceneGroup[]
const scenes = [scene('a', 'g1'), scene('b', 'g1'), scene('c', null), scene('d', 'g2'), scene('e', 'gone')]

describe('groupBands', () => {
  it('draws one band per run of a known group, titled with its name', () => {
    expect(groupBands(scenes, groups)).toEqual([
      { key: 'g1', start: 0, length: 2, label: 'Ato I', colorClass: 'group-amber', title: 'Ato I' },
      { key: 'g2', start: 3, length: 1, label: 'Ato II', colorClass: 'group-teal', title: 'Ato II' },
    ])
  })

  it('takes another title from the group and its run', () => {
    expect(groupBands(scenes, groups, (group, run) => `${group.name} · ${run.length}`).map((band) => band.title)).toEqual([
      'Ato I · 2',
      'Ato II · 1',
    ])
  })
})
