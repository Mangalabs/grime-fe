// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ReactElement } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Slot, UsageSummary } from '../api/contracts'
import { AnalysisStartDialog } from './analysis/BackgroundAnalysis'
import { NewEntityDialog } from './archive/NewEntityDialog'
import { GroupManager } from './GroupManager'
import { MergeDialog } from './MergeDialog'
import { MoveHistory } from './MoveHistory'
import { UsageDialog } from './usage/UsageDialog'

// Characterization of how dialogs close with Escape: always, except while a
// confirmation is running.

vi.mock('../features/usage/useUsage', () => ({ useUsage: () => ({ usage: null }) }))

const usage = {
  limit: 100,
  used: 10,
  remaining: 90,
  periodStart: '2026-10-01T00:00:00.000Z',
  resetsAt: '2026-11-01T00:00:00.000Z',
  byFeature: { IMPORT: 0, LINTER: 4, ARCHIVIST: 3, ARCHITECT: 2, MARKETING: 1 },
} as UsageSummary
const slots = [{ id: 's1', projectId: 'p1', title: 'Um', isUnanchored: false, timelinePosition: 0 }] as Slot[]

const dialogs: Record<string, (onClose: () => void) => ReactElement> = {
  MoveHistory: (onClose) => <MoveHistory moves={[]} slots={slots} undoingMoveId={null} onClose={onClose} onSelectSlot={vi.fn()} onUndo={vi.fn()} />,
  UsageDialog: (onClose) => <UsageDialog usage={usage} onClose={onClose} />,
  MergeDialog: (onClose) => <MergeDialog nextTitle="Dois" title="Um" onClose={onClose} onConfirm={() => new Promise(() => undefined)} />,
  NewEntityDialog: (onClose) => <NewEntityDialog initialType="CHARACTER" onClose={onClose} onCreate={() => new Promise(() => undefined)} />,
  GroupManager: (onClose) => (
    <GroupManager focusGroupId={null} groups={[]} scenes={slots} onClose={onClose} onCreate={vi.fn()} onDelete={vi.fn()} onUpdate={vi.fn()} />
  ),
  AnalysisStartDialog: (onClose) => <AnalysisStartDialog slots={slots} onClose={onClose} onStart={vi.fn()} />,
}

afterEach(() => {
  cleanup()
})

describe('dialogs close on Escape (characterization)', () => {
  for (const [name, dialog] of Object.entries(dialogs)) {
    it(`${name} closes on Escape, not on other keys, and stops listening when gone`, () => {
      const onClose = vi.fn()
      const { unmount } = render(dialog(onClose))
      fireEvent.keyDown(document, { key: 'Enter' })
      expect(onClose).not.toHaveBeenCalled()
      fireEvent.keyDown(document, { key: 'Escape' })
      expect(onClose).toHaveBeenCalledTimes(1)
      unmount()
      fireEvent.keyDown(document, { key: 'Escape' })
      expect(onClose).toHaveBeenCalledTimes(1)
    })
  }

  it('MergeDialog ignores Escape while joining', async () => {
    const onClose = vi.fn()
    render(dialogs.MergeDialog(onClose))
    await act(async () => fireEvent.click(screen.getByRole('button', { name: /Juntar/ })))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).not.toHaveBeenCalled()
  })

  it('NewEntityDialog ignores Escape while creating', async () => {
    const onClose = vi.fn()
    render(dialogs.NewEntityDialog(onClose))
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Ana' } })
    await act(async () => fireEvent.submit(screen.getByRole('textbox').closest('form')!))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).not.toHaveBeenCalled()
  })
})
