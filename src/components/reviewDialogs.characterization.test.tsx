// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Slot } from '../api/contracts'
import { emptyStyleSheet, typographyRuleId } from '../features/style/styleSheet'
import { LineBreakRepairModal } from './LineBreakRepairModal'
import { CopyeditModal } from './style/CopyeditModal'

// Characterization of the two "review a batch of changes" dialogs: loading the
// scenes, the list, ticking and unticking, and what applying saves.

type Draft = { content?: string; genre?: string; focusMode?: string }
let stored: Record<string, Draft | null> = {}
const failReads = { on: false }
const failSaveAt = { index: -1 }
const saves: Array<[string, unknown]> = []
const versions: unknown[][] = []

vi.mock('../api/client', () => ({
  api: {
    getSlotReview: vi.fn(async (slotId: string) => {
      if (failReads.on) throw new Error('Sem rede')
      const draft = stored[slotId]
      return { content: draft ? { ciphertext: JSON.stringify(draft), iv: 'iv' } : null, diagnostics: [] }
    }),
    saveSceneContent: vi.fn(async (slotId: string, sealed: unknown) => {
      if (saves.length === failSaveAt.index) throw new Error('Falhou')
      saves.push([slotId, sealed])
    }),
  },
}))

vi.mock('../crypto/projectEncryption', () => ({
  decryptSceneDraft: vi.fn(async (_key: CryptoKey, ciphertext: string) => JSON.parse(ciphertext)),
  encryptSceneDraft: vi.fn(async (_key: CryptoKey, draft: unknown) => ({ sealed: draft })),
}))

vi.mock('../features/versions/versions', () => ({
  saveVersion: vi.fn(async (...args: unknown[]) => {
    versions.push(args)
  }),
}))

const slot = (id: string, position: number | null, title: string): Slot =>
  ({ id, projectId: 'p1', title, isUnanchored: position === null, timelinePosition: position }) as Slot

const slots = [slot('s2', 1, 'Segunda'), slot('s1', 0, 'Primeira'), slot('s3', 2, 'Sem texto'), slot('s4', null, 'Gaveta')]

const key = {} as CryptoKey
const html = () => document.body.innerHTML

beforeEach(() => {
  saves.length = 0
  versions.length = 0
  failReads.on = false
  failSaveAt.index = -1
})

afterEach(() => {
  cleanup()
})

describe('LineBreakRepairModal (characterization)', () => {
  beforeEach(() => {
    stored = {
      s1: { content: 'Ela andou pela\nrua escura e\nvoltou.\n\nOutro parágrafo.', genre: 'Fantasia', focusMode: 'DIALOGUE' },
      s2: { content: 'Ele disse que\nvinha amanhã.' },
      s3: null,
      s4: { content: 'Tudo certo aqui.' },
    }
  })

  async function open(onApplied = vi.fn(), onClose = vi.fn()) {
    render(<LineBreakRepairModal projectKey={key} slots={slots} onApplied={onApplied} onClose={onClose} />)
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull())
    return { onApplied, onClose }
  }

  it('lists, unticks and joins', async () => {
    const { onApplied } = await open()
    expect(html()).toMatchSnapshot('listed')

    // Open the second scene and untick its only break, then the first break of the first scene.
    const heads = screen.getAllByRole('button', { expanded: false })
    await act(async () => fireEvent.click(heads[0]))
    expect(html()).toMatchSnapshot('second scene open')
    fireEvent.click(screen.getAllByRole('checkbox').filter((box) => box.closest('.linebreak-list'))[0])
    expect(html()).toMatchSnapshot('one unticked')

    fireEvent.click(screen.getByText('Desmarcar todas'))
    expect(html()).toMatchSnapshot('none')
    fireEvent.click(screen.getByText('Marcar todas'))
    fireEvent.click(screen.getByLabelText('Juntar as quebras de Segunda'))
    expect(html()).toMatchSnapshot('scene unticked')

    await act(async () => fireEvent.click(screen.getByText(/^Juntar \d/)))
    expect(saves).toMatchSnapshot('saved')
    expect(onApplied.mock.calls).toMatchSnapshot('applied')
    expect(html()).toMatchSnapshot('done')
  })

  it('reports a failed read', async () => {
    failReads.on = true
    render(<LineBreakRepairModal projectKey={key} slots={slots} onApplied={vi.fn()} onClose={vi.fn()} />)
    await waitFor(() => expect(screen.getByText('Sem rede')).toBeTruthy())
    expect(html()).toMatchSnapshot()
  })

  it('reports a save that fails half way', async () => {
    failSaveAt.index = 1
    const { onApplied } = await open()
    await act(async () => fireEvent.click(screen.getByText(/^Juntar \d/)))
    expect(onApplied.mock.calls).toMatchSnapshot('applied')
    expect(html()).toMatchSnapshot('error')
  })

  it('says when there is nothing to join', async () => {
    stored = { s1: { content: 'Nada.' }, s2: null, s3: null, s4: null }
    await open()
    expect(html()).toMatchSnapshot()
  })
})

describe('CopyeditModal (characterization)', () => {
  const sheet = {
    ...emptyStyleSheet(),
    typography: { ...emptyStyleSheet().typography, ellipsisCharacter: true },
  }

  beforeEach(() => {
    stored = {
      s1: { content: 'Uma idéia boa... e e outra idéia.', genre: 'Drama', focusMode: 'GENERAL' },
      s2: { content: 'O vôo atrasou...' },
      s3: null,
      s4: { content: 'Nada a corrigir.' },
    }
  })

  async function open(scenes = slots, onApplied = vi.fn()) {
    render(<CopyeditModal names={[]} projectId="p1" projectKey={key} sheet={sheet} slots={scenes} onApplied={onApplied} onClose={vi.fn()} />)
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull())
    return onApplied
  }

  it('groups by rule, starts judgement rules unticked, and fixes', async () => {
    const onApplied = await open()
    expect(html()).toMatchSnapshot('listed')
    const rule = screen.getAllByRole('button', { expanded: false })[0]
    await act(async () => fireEvent.click(rule))
    expect(html()).toMatchSnapshot('rule open')
    fireEvent.click(screen.getAllByRole('checkbox').filter((box) => box.closest('.copyedit-list'))[0])
    expect(html()).toMatchSnapshot('one unticked')

    await act(async () => fireEvent.click(screen.getByText(/^Corrigir \d/)))
    expect(versions).toMatchSnapshot('version kept')
    expect(saves).toMatchSnapshot('saved')
    expect(onApplied.mock.calls).toMatchSnapshot('applied')
    expect(html()).toMatchSnapshot('done')
  })

  it('reviews one scene', async () => {
    await open([slots[1]])
    expect(html()).toMatchSnapshot()
  })

  it('says when there is nothing to fix', async () => {
    stored = { s1: { content: 'Tudo bem.' }, s2: null, s3: null, s4: null }
    await open()
    expect(html()).toMatchSnapshot()
  })

  it('reports a save that fails half way', async () => {
    failSaveAt.index = 1
    const onApplied = await open()
    fireEvent.click(screen.getByText('Marcar todas'))
    await act(async () => fireEvent.click(screen.getByText(/^Corrigir \d/)))
    expect(onApplied.mock.calls).toMatchSnapshot('applied')
    expect(html()).toMatchSnapshot('error')
  })

  it('knows its judgement rules', () => {
    expect(typographyRuleId('repeatedWords')).toBe('typography:repeatedWords')
  })
})
