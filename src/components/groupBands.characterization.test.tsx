// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Slot } from '../api/contracts'
import { ArchitectMap } from './ArchitectMap'
import { RhythmChart } from './rhythm/RhythmChart'
import type { StripBand } from './SceneStrip'

// Characterization of the group bands drawn over the architect map and the
// rhythm chart.

const scenes = [0, 1, 2].map((position) => ({ id: `s${position}`, title: `Cena ${position}`, isUnanchored: false, timelinePosition: position })) as Slot[]
const bands: StripBand[] = [
  { key: 'g1', start: 0, length: 2, label: 'Ato I', colorClass: 'group-amber', title: 'Ato I · cenas 1–2' },
  { key: 'g2', start: 2, length: 1, label: 'Ato II', colorClass: 'group-teal', title: 'Ato II' },
]

afterEach(() => {
  cleanup()
})

const bandsHtml = () => [...document.querySelectorAll('.overview-bands')].map((element) => element.outerHTML)

describe('group bands (characterization)', () => {
  it('on the architect map', () => {
    render(<ArchitectMap activeKey={null} bands={bands} findings={[]} scenes={scenes} onSelectFinding={vi.fn()} />)
    expect(bandsHtml()).toMatchSnapshot()
  })

  it('on the rhythm chart', () => {
    const metrics = scenes.map(() => ({
      words: 100,
      dialogueShare: 0.2,
      sentences: 8,
      avgSentenceWords: 12,
      sentenceSpread: 3,
      paragraphs: 4,
      avgParagraphWords: 25,
      questionsPer1k: 1,
      exclamationsPer1k: 0,
      opening: 'Era',
      openingKind: 'narration',
      ending: 'fim',
    }))
    render(
      <RhythmChart
        bands={bands}
        cast={[]}
        facts={null}
        metrics={metrics as never[]}
        scenes={scenes}
        selected={null}
        tension={null}
        onHover={vi.fn()}
        onSelect={vi.fn()}
      />,
    )
    expect(bandsHtml()).toMatchSnapshot()
  })
})
