import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  deleteBackward,
  deleteForward,
  deleteRange,
  draftEdits,
  draftPieces,
  insertText,
  startDraft,
  type DraftChange,
  type SuggestDraft,
} from '../../features/suggestions/suggestDraft'
import { rememberedSuggester, rememberSuggester, sendSuggestions } from '../../features/suggestions/sendSuggestions'
import { plural } from '../../features/text/plural'
import './SuggestSurface.css'

interface SuggestSurfaceProps {
  projectId: string
  projectKey: CryptoKey
  slotId: string
  // The scene's text as stored: the suggestions are changes to it.
  text: string
  isLinked: boolean
  // How many changes are waiting to be sent, so leaving can ask first.
  onPendingChange: (count: number) => void
  onDone: (sent: number) => void
}

const HISTORY = 200

// Positions in the visual text (what is on screen, struck text included) and
// places in the DOM, which holds exactly that text.
function visualOffset(root: HTMLElement, node: Node, offset: number) {
  const range = document.createRange()
  range.setStart(root, 0)
  range.setEnd(node, offset)
  return range.toString().length
}

function domPlace(root: HTMLElement, position: number): { node: Node; offset: number } {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let seen = 0
  let last: Text | null = null
  for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
    if (position <= seen + node.length) return { node, offset: position - seen }
    seen += node.length
    last = node
  }
  return last ? { node: last, offset: last.length } : { node: root, offset: 0 }
}

/**
 * Suggesting mode, in the scene's own text: what the reviewer types is added
 * in green, what they delete is struck through, nothing of the original is
 * lost. Sent, each change becomes a suggestion the author accepts or declines.
 */
export function SuggestSurface({ projectId, projectKey, slotId, text, isLinked, onPendingChange, onDone }: SuggestSurfaceProps) {
  const [draft, setDraft] = useState<SuggestDraft>(() => startDraft(text))
  // Undo and redo, as the drafts before and after this one.
  const [history, setHistory] = useState<{ past: SuggestDraft[]; future: SuggestDraft[] }>({ past: [], future: [] })
  const [name, setName] = useState(rememberedSuggester)
  const [isSending, setIsSending] = useState(false)
  const [error, setError] = useState('')
  // Remounts the text after the browser composed into it (accents, IME).
  const [renderKey, setRenderKey] = useState(0)
  const surfaceRef = useRef<HTMLDivElement>(null)
  const caretRef = useRef<number | null>(null)
  const composingFrom = useRef<{ from: number; to: number } | null>(null)

  const pieces = useMemo(() => draftPieces(draft), [draft])
  const edits = useMemo(() => draftEdits(draft), [draft])

  useEffect(() => {
    onPendingChange(edits.length)
  }, [edits.length, onPendingChange])

  // The latest state for the native listeners below. Written as soon as it
  // changes, so two keys before a render both build on the newest text.
  const stateRef = useRef({ draft, history })
  useEffect(() => {
    stateRef.current = { draft, history }
  })

  function commit(next: SuggestDraft, nextHistory: typeof history, caret: number | null) {
    stateRef.current = { draft: next, history: nextHistory }
    setHistory(nextHistory)
    setDraft(next)
    caretRef.current = caret
  }

  // A run of typing (or of deleting) at the same spot is one step to undo.
  const lastStep = useRef<{ kind: string; caret: number; at: number } | null>(null)

  function apply(change: DraftChange, kind = 'other', caretBefore: number | null = null) {
    const { draft: current, history: { past } } = stateRef.current
    // Nothing changed (Backspace at the very start): nothing to draw again.
    if (change.draft === current) return
    const last = lastStep.current
    const now = Date.now()
    const continues =
      kind !== 'other' && caretBefore !== null && last?.kind === kind && last.caret === caretBefore && now - last.at < 1000
    lastStep.current = { kind, caret: change.caret, at: now }
    commit(change.draft, { past: continues ? past : [...past.slice(-HISTORY), current], future: [] }, change.caret)
  }

  function undo() {
    const { draft: current, history: { past, future } } = stateRef.current
    const previous = past.at(-1)
    lastStep.current = null
    if (previous) commit(previous, { past: past.slice(0, -1), future: [current, ...future] }, null)
  }

  function redo() {
    const { draft: current, history: { past, future } } = stateRef.current
    const [next, ...rest] = future
    lastStep.current = null
    if (next) commit(next, { past: [...past, current], future: rest }, null)
  }

  function selection() {
    const root = surfaceRef.current
    const current = window.getSelection()
    if (!root || !current || current.rangeCount === 0) return null
    const range = current.getRangeAt(0)
    if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return null
    return {
      from: visualOffset(root, range.startContainer, range.startOffset),
      to: visualOffset(root, range.endContainer, range.endOffset),
    }
  }

  // Every edit is the model's: the browser's own is cancelled, then the text
  // is drawn again from the model.
  useEffect(() => {
    const root = surfaceRef.current
    if (!root) return
    const onBeforeInput = (event: InputEvent) => {
      if (event.inputType === 'insertCompositionText') return
      event.preventDefault()
      const place = selection()
      if (!place) return
      const { draft: current } = stateRef.current
      const typed = (text: string) => {
        const collapsed = place.to === place.from
        const cleared = collapsed ? { draft: current, caret: place.from } : deleteRange(current, place.from, place.to)
        // Typing over a selection starts a step the rest of the word joins.
        if (!collapsed) lastStep.current = null
        apply(insertText(cleared.draft, cleared.caret, text), 'type', collapsed ? place.from : null)
      }
      switch (event.inputType) {
        case 'insertText':
        case 'insertReplacementText':
        case 'insertFromPaste':
        case 'insertFromDrop':
          typed((event.data ?? event.dataTransfer?.getData('text/plain') ?? '').replace(/\r\n?/g, '\n'))
          return
        case 'insertParagraph':
        case 'insertLineBreak':
          typed('\n')
          return
        case 'deleteContentBackward':
          apply(
            place.to > place.from ? deleteRange(current, place.from, place.to) : deleteBackward(current, place.from),
            place.to > place.from ? 'other' : 'backspace',
            place.from,
          )
          return
        case 'deleteContentForward':
          apply(
            place.to > place.from ? deleteRange(current, place.from, place.to) : deleteForward(current, place.from),
            place.to > place.from ? 'other' : 'delete',
            place.from,
          )
          return
        case 'historyUndo':
          undo()
          return
        case 'historyRedo':
          redo()
          return
        default: {
          // Word and line deletions, cut, drag: the range the browser meant.
          if (!event.inputType.startsWith('delete')) return
          const [target] = event.getTargetRanges?.() ?? []
          const range = target ?? null
          if (!range) {
            if (place.to > place.from) apply(deleteRange(current, place.from, place.to))
            return
          }
          apply(
            deleteRange(
              current,
              visualOffset(root, range.startContainer, range.startOffset),
              visualOffset(root, range.endContainer, range.endOffset),
            ),
          )
        }
      }
    }
    const onCompositionStart = () => {
      composingFrom.current = selection()
    }
    const onCompositionEnd = (event: CompositionEvent) => {
      const place = composingFrom.current
      composingFrom.current = null
      setRenderKey((key) => key + 1)
      if (!place || !event.data) return
      const { draft: current } = stateRef.current
      const cleared = place.to > place.from ? deleteRange(current, place.from, place.to) : { draft: current, caret: place.from }
      apply(insertText(cleared.draft, cleared.caret, event.data))
    }
    // The browser has nothing to undo (every edit is the model's), so it may
    // not even send historyUndo: the keys are caught here.
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return
      const key = event.key.toLowerCase()
      if (key === 'z' && !event.shiftKey) {
        event.preventDefault()
        undo()
      } else if (key === 'y' || (key === 'z' && event.shiftKey)) {
        event.preventDefault()
        redo()
      }
    }
    root.addEventListener('keydown', onKeyDown)
    root.addEventListener('beforeinput', onBeforeInput)
    root.addEventListener('compositionstart', onCompositionStart)
    root.addEventListener('compositionend', onCompositionEnd)
    return () => {
      root.removeEventListener('keydown', onKeyDown)
      root.removeEventListener('beforeinput', onBeforeInput)
      root.removeEventListener('compositionstart', onCompositionStart)
      root.removeEventListener('compositionend', onCompositionEnd)
    }
    // The listeners read the state through stateRef; the element can be remounted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [renderKey])

  // After each change the caret goes where the model put it.
  useLayoutEffect(() => {
    const root = surfaceRef.current
    if (!root || caretRef.current === null) return
    const { node, offset } = domPlace(root, caretRef.current)
    const current = window.getSelection()
    if (!current) return
    root.focus()
    current.collapse(node, offset)
  }, [draft, renderKey])

  async function send() {
    const author = name.trim()
    if (!author || edits.length === 0) return
    setIsSending(true)
    setError('')
    rememberSuggester(author)
    try {
      await sendSuggestions({ projectId, projectKey, slotId, text, edits, author, isLinked })
      onDone(edits.length)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível enviar as sugestões.')
      setIsSending(false)
    }
  }

  function discard() {
    if (edits.length > 0 && !window.confirm('Descartar as sugestões ainda não enviadas?')) return
    onDone(0)
  }

  return (
    <div className="suggest-surface">
      <div
        aria-label="Texto da cena: escreva para sugerir"
        aria-multiline="true"
        className="scene-reading suggest-reading"
        contentEditable={!isSending}
        key={renderKey}
        ref={surfaceRef}
        role="textbox"
        spellCheck
        suppressContentEditableWarning
      >
        {pieces.map((piece, index) =>
          piece.kind === 'added' ? (
            <ins key={index}>{piece.text}</ins>
          ) : piece.kind === 'removed' ? (
            <del key={index}>{piece.text}</del>
          ) : (
            <span key={index}>{piece.text}</span>
          ),
        )}
      </div>

      <div className="suggest-bar" role="region" aria-label="Sugestões desta cena">
        <span className="suggest-bar-status">
          <strong>Sugerindo</strong>
          <span>{edits.length === 0 ? 'escreva no texto' : plural(edits.length, 'alteração', 'alterações')}</span>
        </span>
        <label className="suggest-bar-name">
          <span className="sr-only">Seu nome</span>
          <input maxLength={80} placeholder="Seu nome" value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        {error && <span className="suggest-bar-error">{error}</span>}
        <span className="suggest-bar-actions">
          <button className="text-button" disabled={isSending} type="button" onClick={discard}>
            {edits.length === 0 ? 'Sair' : 'Descartar'}
          </button>
          <button
            className="button button-primary button-small"
            disabled={isSending || edits.length === 0 || !name.trim()}
            title={name.trim() ? undefined : 'Diga quem está sugerindo'}
            type="button"
            onClick={() => void send()}
          >
            {isSending ? 'Enviando…' : isLinked ? 'Enviar ao Google Docs' : 'Enviar sugestões'}
          </button>
        </span>
      </div>
    </div>
  )
}
