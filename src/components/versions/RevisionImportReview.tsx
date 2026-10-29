import { useEffect, useMemo, useState } from 'react'
import { api } from '../../api/client'
import { decryptSceneDraft, encryptSceneDraft } from '../../crypto/projectEncryption'
import { matchRevision, type RevisionMatch } from '../../features/versions/compare'
import { sceneSimilarity } from '../../features/versions/diff'
import { currentScenes, saveVersion, type VersionScene } from '../../features/versions/versions'

export interface RevisionResult {
  updated: number
  created: number
  unchanged: number
  // Project scenes the new file doesn't have; they stay in the timeline.
  missing: number
  changedSlotIds: string[]
}

interface Props {
  projectId: string
  projectKey: CryptoKey
  importId: string
  fileName: string
  imported: Array<{ sequence: number; title: string; rawContent: string }>
  onApplied: (result: RevisionResult) => void
  onCancel: () => void
}

const NEW = 'new'
const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`
const settled = (text: string) => text.replace(/\r\n?/g, '\n').replace(/[^\S\n]+$/gm, '').trim()

/**
 * The scenes of an author's revision paired with the project's, for the
 * reviewer to check before anything is saved. Applying saves a version of
 * the text as it was, updates the paired scenes and creates the new ones.
 */
export function RevisionImportReview({ projectId, projectKey, importId, fileName, imported, onApplied, onCancel }: Props) {
  const [current, setCurrent] = useState<VersionScene[] | null>(null)
  const [matches, setMatches] = useState<RevisionMatch[]>([])
  const [loading, setLoading] = useState('Lendo as cenas do projeto…')
  const [applying, setApplying] = useState<string | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let isCurrent = true
    void (async () => {
      try {
        const scenes = await currentScenes(projectId, projectKey, undefined, (done, total) => {
          if (isCurrent) setLoading(`Lendo as cenas do projeto: ${done} de ${total}`)
        })
        if (!isCurrent) return
        setCurrent(scenes)
        setMatches(
          matchRevision(
            imported.map((scene) => ({ sequence: scene.sequence, title: scene.title, content: scene.rawContent })),
            scenes,
          ),
        )
        setLoading('')
      } catch (reason) {
        if (isCurrent) setError(reason instanceof Error ? reason.message : 'Não foi possível ler as cenas do projeto.')
      }
    })()
    return () => {
      isCurrent = false
    }
  }, [projectId, projectKey, imported])

  const byId = useMemo(() => new Map((current ?? []).map((scene) => [scene.slotId, scene])), [current])
  const rows = matches.map((match) => {
    const target = match.slotId ? byId.get(match.slotId) : undefined
    const status = !target ? 'new' : settled(target.content) === settled(match.content) ? 'same' : 'changed'
    return { match, target, status }
  })
  const usage = new Map<string, number>()
  for (const match of matches) if (match.slotId) usage.set(match.slotId, (usage.get(match.slotId) ?? 0) + 1)
  const duplicated = [...usage.values()].some((count) => count > 1)
  const missing = (current ?? []).filter((scene) => !usage.has(scene.slotId))
  const counts = {
    changed: rows.filter((row) => row.status === 'changed').length,
    same: rows.filter((row) => row.status === 'same').length,
    new: rows.filter((row) => row.status === 'new').length,
  }

  function pair(index: number, slotId: string) {
    setMatches((list) =>
      list.map((match, position) =>
        position === index ? { ...match, slotId: slotId === NEW ? null : slotId, reason: slotId === NEW ? 'none' : 'order' } : match,
      ),
    )
  }

  async function apply() {
    if (!current) return
    setError('')
    try {
      const renamed = rows.some(
        ({ match, target }) => target && match.title.trim() && match.title.trim() !== target.title.trim(),
      )
      if (counts.changed + counts.new === 0 && !renamed) {
        // Nothing to update: the import just closes.
        await api.closeManuscriptImport(projectId, importId)
        onApplied({ updated: 0, created: 0, unchanged: counts.same, missing: missing.length, changedSlotIds: [] })
        return
      }
      setApplying('Guardando a versão de antes…')
      await saveVersion(projectId, projectKey, 'IMPORT', `Antes de importar ${fileName}`, current)

      const changedSlotIds: string[] = []
      let created = 0
      let previousSlotId: string | null = null
      for (const [index, row] of rows.entries()) {
        setApplying(`Atualizando as cenas: ${index + 1} de ${rows.length}`)
        if (row.target) {
          if (row.status === 'changed') {
            // Keep the scene's genre and focus; only the text changes.
            const review = await api.getSlotReview(row.target.slotId)
            const draft = review.content
              ? await decryptSceneDraft(projectKey, review.content.ciphertext, review.content.iv)
              : { genre: '', focusMode: 'GENERAL' }
            await api.saveSceneContent(
              row.target.slotId,
              await encryptSceneDraft(projectKey, {
                content: row.match.content,
                genre: draft.genre ?? '',
                focusMode: draft.focusMode ?? 'GENERAL',
              }),
            )
            changedSlotIds.push(row.target.slotId)
          }
          // Titles follow the file: chapter numbers shift when one is added.
          if (row.match.title.trim() && row.match.title.trim() !== row.target.title.trim()) {
            await api.renameProjectSlot(projectId, row.target.slotId, row.match.title.trim())
          }
          previousSlotId = row.target.slotId
          continue
        }
        // A new scene goes right after the one before it in the file.
        const slot = await api.createProjectSlot(projectId, {
          title: row.match.title,
          isUnanchored: false,
          afterSlotId: previousSlotId ?? undefined,
        })
        await api.saveSceneContent(
          slot.id,
          await encryptSceneDraft(projectKey, { content: row.match.content, genre: '', focusMode: 'GENERAL' }),
        )
        changedSlotIds.push(slot.id)
        created += 1
        previousSlotId = slot.id
      }
      setApplying('Concluindo…')
      await api.closeManuscriptImport(projectId, importId)
      onApplied({ updated: counts.changed, created, unchanged: counts.same, missing: missing.length, changedSlotIds })
    } catch (reason) {
      setApplying(null)
      setError(
        reason instanceof Error
          ? `A atualização parou no meio: ${reason.message}. A versão de antes foi guardada em Versões.`
          : 'A atualização parou no meio. A versão de antes foi guardada em Versões.',
      )
    }
  }

  if (!current) {
    return (
      <>
        <p className="import-note" role="status">
          {error || loading}
        </p>
        <div className="modal-actions">
          <button className="button button-secondary" type="button" onClick={onCancel}>
            Fechar e continuar depois
          </button>
        </div>
      </>
    )
  }

  return (
    <>
      <p className="import-note">
        {plural(imported.length, 'cena encontrada', 'cenas encontradas')} no arquivo:{' '}
        <strong>{plural(counts.changed, 'alterada', 'alteradas')}</strong>, {plural(counts.same, 'igual', 'iguais')} e{' '}
        <strong>{plural(counts.new, 'nova', 'novas')}</strong>.
        {missing.length > 0 &&
          ` ${plural(missing.length, 'cena do projeto não aparece', 'cenas do projeto não aparecem')} no arquivo e ${missing.length === 1 ? 'fica' : 'ficam'} como está.`}{' '}
        Confira os pares; uma versão do texto de agora é guardada antes de atualizar.
      </p>
      <ol className="revision-rows">
        {rows.map(({ match, target, status }, index) => (
          <li className={`revision-row is-${status}`} key={`${match.sequence}-${index}`}>
            <span className="revision-file">
              <small>No arquivo</small>
              <strong>{match.title || `Cena ${index + 1}`}</strong>
            </span>
            <span className="revision-arrow" aria-hidden="true">
              →
            </span>
            <label className="revision-target">
              <small>
                {status === 'new' ? 'Vira uma cena nova' : status === 'same' ? 'Sem mudanças' : 'Atualiza'}
                {target && status === 'changed' && ` · ${Math.round(sceneSimilarity(target.content, match.content) * 100)}% parecida`}
              </small>
              <select value={match.slotId ?? NEW} onChange={(event) => pair(index, event.target.value)}>
                <option value={NEW}>Cena nova</option>
                {current.map((scene, position) => (
                  <option key={scene.slotId} value={scene.slotId}>
                    {position + 1}. {scene.title || 'Cena sem título'}
                  </option>
                ))}
              </select>
            </label>
          </li>
        ))}
      </ol>
      {duplicated && (
        <p className="form-message">Duas cenas do arquivo apontam para a mesma cena do projeto. Escolha uma para cada.</p>
      )}
      {error && <p className="form-message">{error}</p>}
      {applying && (
        <p className="import-note" role="status">
          {applying}
        </p>
      )}
      <div className="modal-actions">
        <button className="button button-secondary" disabled={Boolean(applying)} type="button" onClick={onCancel}>
          Fechar e continuar depois
        </button>
        <button
          className="button button-primary"
          disabled={Boolean(applying) || duplicated}
          type="button"
          onClick={() => void apply()}
        >
          {counts.changed + counts.new === 0
            ? 'Nada mudou: concluir'
            : `Atualizar ${plural(counts.changed + counts.new, 'cena', 'cenas')}`}
        </button>
      </div>
    </>
  )
}
