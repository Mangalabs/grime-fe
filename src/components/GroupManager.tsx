import { useEffect, useState } from 'react'
import './Modal.css'
import './GroupManager.css'
import { groupColors, type GroupColor, type SceneGroup, type Slot } from '../api/contracts'
import {
  describeGroupScenes,
  groupColorLabels,
  structureTemplates,
  templateGroups,
} from '../features/scenes/groups'
import { ArrowDownIcon, ArrowUpIcon, CloseIcon } from './icons'

interface GroupManagerProps {
  groups: SceneGroup[]
  // Anchored scenes in timeline order, to describe what each group covers.
  scenes: Slot[]
  focusGroupId: string | null
  onCreate: (groups: Array<{ name: string; color: GroupColor }>) => Promise<void>
  onUpdate: (groupId: string, patch: { name?: string; color?: GroupColor; position?: number }) => Promise<void>
  onDelete: (group: SceneGroup) => Promise<void>
  onClose: () => void
}

/** "Estrutura": create, rename, recolour, reorder and delete scene groups. */
export function GroupManager({
  groups,
  scenes,
  focusGroupId,
  onCreate,
  onUpdate,
  onDelete,
  onClose,
}: GroupManagerProps) {
  const [newName, setNewName] = useState('')
  const [names, setNames] = useState<Record<string, string>>({})
  const [pickerFor, setPickerFor] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', close)
    return () => document.removeEventListener('keydown', close)
  }, [onClose])

  useEffect(() => {
    if (focusGroupId) {
      document.getElementById(`group-row-${focusGroupId}`)?.scrollIntoView({ block: 'nearest' })
    }
  }, [focusGroupId])

  async function run(action: () => Promise<void>) {
    setBusy(true)
    setError(null)
    try {
      await action()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível salvar a estrutura.')
    } finally {
      setBusy(false)
    }
  }

  function saveName(group: SceneGroup) {
    const name = (names[group.id] ?? group.name).trim()
    if (name && name !== group.name) void run(() => onUpdate(group.id, { name }))
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        aria-labelledby="group-manager-title"
        aria-modal="true"
        className="modal group-manager"
        role="dialog"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <p className="eyebrow">Linha do tempo</p>
        <h2 id="group-manager-title">Estrutura da obra</h2>
        <p>
          Agrupe cenas em atos, etapas da jornada do herói ou batidas. Para atribuir cenas, use
          Shift + clique na barra de cenas para escolher um intervalo.
        </p>

        {groups.length === 0 ? (
          <p className="group-empty">Nenhum grupo ainda. Comece por um modelo ou crie o seu.</p>
        ) : (
          <ol className="group-list">
            {groups.map((group, index) => (
              <li
                className={`group-row group-${group.color}${group.id === focusGroupId ? ' is-focused' : ''}`}
                id={`group-row-${group.id}`}
                key={group.id}
              >
                <div className="group-color-cell">
                  <button
                    aria-expanded={pickerFor === group.id}
                    aria-label={`Cor: ${groupColorLabels[group.color]}`}
                    className="group-swatch"
                    type="button"
                    onClick={() => setPickerFor(pickerFor === group.id ? null : group.id)}
                  />
                  {pickerFor === group.id && (
                    <div className="group-picker" role="radiogroup" aria-label="Cor do grupo">
                      {groupColors.map((color) => (
                        <button
                          aria-checked={color === group.color}
                          aria-label={groupColorLabels[color]}
                          className={`group-swatch group-${color}${color === group.color ? ' is-current' : ''}`}
                          key={color}
                          role="radio"
                          type="button"
                          onClick={() => {
                            setPickerFor(null)
                            void run(() => onUpdate(group.id, { color }))
                          }}
                        />
                      ))}
                    </div>
                  )}
                </div>
                <div className="group-main">
                  <input
                    aria-label="Nome do grupo"
                    value={names[group.id] ?? group.name}
                    onBlur={() => saveName(group)}
                    onChange={(event) => setNames({ ...names, [group.id]: event.target.value })}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') (event.target as HTMLInputElement).blur()
                    }}
                  />
                  <span className="group-scenes">{describeGroupScenes(scenes, group)}</span>
                </div>
                <div className="group-actions">
                  <button
                    aria-label="Mover para cima"
                    className="relation-remove"
                    disabled={busy || index === 0}
                    type="button"
                    onClick={() => void run(() => onUpdate(group.id, { position: index - 1 }))}
                  >
                    <ArrowUpIcon />
                  </button>
                  <button
                    aria-label="Mover para baixo"
                    className="relation-remove"
                    disabled={busy || index === groups.length - 1}
                    type="button"
                    onClick={() => void run(() => onUpdate(group.id, { position: index + 1 }))}
                  >
                    <ArrowDownIcon />
                  </button>
                  <button
                    aria-label={`Excluir ${group.name}`}
                    className="relation-remove"
                    disabled={busy}
                    type="button"
                    onClick={() => {
                      if (window.confirm(`Excluir o grupo “${group.name}”? As cenas continuam na timeline, só deixam o grupo.`)) {
                        void run(() => onDelete(group))
                      }
                    }}
                  >
                    <CloseIcon />
                  </button>
                </div>
              </li>
            ))}
          </ol>
        )}

        <form
          className="group-new"
          onSubmit={(event) => {
            event.preventDefault()
            const name = newName.trim()
            if (!name) return
            void run(async () => {
              await onCreate([{ name, color: groupColors[groups.length % groupColors.length] }])
              setNewName('')
            })
          }}
        >
          <input
            aria-label="Nome do novo grupo"
            placeholder="Novo grupo, ex.: Ato I"
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
          />
          <button className="button button-secondary" disabled={busy || !newName.trim()} type="submit">
            Criar grupo
          </button>
        </form>

        <div className="group-templates">
          <h3>Começar de um modelo</h3>
          <div className="group-template-list">
            {structureTemplates.map((template) => (
              <button
                className="group-template"
                disabled={busy}
                key={template.id}
                type="button"
                onClick={() => void run(() => onCreate(templateGroups(template, groups.length)))}
              >
                <strong>{template.name}</strong>
                <span>{template.description}</span>
              </button>
            ))}
          </div>
        </div>

        {error && <p className="form-message">{error}</p>}
        <div className="modal-actions">
          <button className="button button-secondary" type="button" onClick={onClose}>
            Fechar
          </button>
        </div>
      </section>
    </div>
  )
}
