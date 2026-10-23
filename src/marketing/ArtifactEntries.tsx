import { useState } from 'react'
import { entryLabels, newEntry, type Artifact, type ArtifactEntry } from './identityModel'
import { EntitySelect, Field } from './identityParts'
import { spoilerLevelLabels, spoilerLevels, type SpoilerLevel } from './marketingKit'
import { timeline, type StoryData } from './worldPack'

/**
 * What the visitor reads inside an object: the diary's pages, the chat's
 * messages, the map's notes. Always written by a person: the platform never
 * writes the book's or its characters' words.
 */
export function ArtifactEntries({
  story,
  artifact,
  onChange,
}: {
  story: StoryData
  artifact: Artifact
  onChange: (artifact: Artifact) => void
}) {
  const [isOpen, setIsOpen] = useState(false)
  const labels = entryLabels[artifact.kind]
  const entries = artifact.entries
  const ordered = timeline(story.slots)
  const setEntries = (next: ArtifactEntry[]) => onChange({ ...artifact, entries: next })
  const update = (id: string, patch: Partial<ArtifactEntry>) =>
    setEntries(entries.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)))
  const move = (index: number, by: -1 | 1) => {
    const next = [...entries]
    const [entry] = next.splice(index, 1)
    next.splice(index + by, 0, entry)
    setEntries(next)
  }

  return (
    <div className="mk-entries">
      <button aria-expanded={isOpen} className="text-button mk-entries-toggle" type="button" onClick={() => setIsOpen((value) => !value)}>
        {isOpen ? '▾' : '▸'} Conteúdo ({entries.length === 1 ? `1 ${labels.noun}` : `${entries.length} itens`})
      </button>

      {isOpen && (
        <>
          {entries.map((entry, index) => (
            <div className="mk-entry" key={entry.id}>
              {labels.title && <Field label={labels.title} value={entry.title} onChange={(title) => update(entry.id, { title })} />}
              <label className="mk-field">
                <span className="mk-label">{labels.body}</span>
                <textarea rows={artifact.kind === 'CHAT' || artifact.kind === 'TICKET' ? 2 : 5} value={entry.body} onChange={(event) => update(entry.id, { body: event.target.value })} />
              </label>
              <div className="mk-grid">
                <EntitySelect label={labels.speaker} story={story} value={entry.speakerId} onChange={(speakerId) => update(entry.id, { speakerId })} />
                <Field label={labels.when} value={entry.when} onChange={(when) => update(entry.id, { when })} />
                <label className="mk-field">
                  <span className="mk-label">Acontece depois da cena</span>
                  <select value={entry.slotId ?? ''} onChange={(event) => update(entry.id, { slotId: event.target.value || null })}>
                    <option value="">Sem cena (atemporal)</option>
                    {ordered.map((slot, position) => (
                      <option key={slot.id} value={slot.id}>{`Cena ${position + 1}${slot.title ? ` · ${slot.title}` : ''}`}</option>
                    ))}
                  </select>
                </label>
                <label className="mk-field">
                  <span className="mk-label">Nível</span>
                  <select value={entry.level} onChange={(event) => update(entry.id, { level: event.target.value as SpoilerLevel })}>
                    {spoilerLevels.map((level) => (
                      <option key={level} value={level}>{spoilerLevelLabels[level]}</option>
                    ))}
                  </select>
                </label>
              </div>
              <Mentions entry={entry} story={story} onChange={(entityIds) => update(entry.id, { entityIds })} />
              <div className="mk-row-foot">
                <span className="admin-card-actions">
                  <button className="text-button" disabled={index === 0} type="button" onClick={() => move(index, -1)}>
                    Subir
                  </button>
                  <button className="text-button" disabled={index === entries.length - 1} type="button" onClick={() => move(index, 1)}>
                    Descer
                  </button>
                </span>
                <button className="text-button" type="button" onClick={() => setEntries(entries.filter((item) => item.id !== entry.id))}>
                  Remover
                </button>
              </div>
            </div>
          ))}

          <button
            className="button button-secondary button-small"
            type="button"
            onClick={() => setEntries([...entries, { ...newEntry(), speakerId: artifact.entityId }])}
          >
            Adicionar {labels.noun}
          </button>

        </>
      )}
    </div>
  )
}

function Mentions({ entry, story, onChange }: { entry: ArtifactEntry; story: StoryData; onChange: (ids: string[]) => void }) {
  const nameOf = new Map(story.entities.map((entity) => [entity.id, entity.name]))
  const available = [...story.entities]
    .filter((entity) => !entry.entityIds.includes(entity.id))
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
  return (
    <div className="mk-tags">
      <span className="mk-label">Quem ou o que aparece</span>
      <div className="mk-tags-box">
        {entry.entityIds.map((id) => (
          <span className="mk-tag" key={id}>
            {nameOf.get(id) ?? 'Entidade removida'}
            <button aria-label={`Remover ${nameOf.get(id) ?? ''}`} type="button" onClick={() => onChange(entry.entityIds.filter((item) => item !== id))}>
              ×
            </button>
          </span>
        ))}
        <select aria-label="Adicionar entidade" className="mk-tags-select" value="" onChange={(event) => event.target.value && onChange([...entry.entityIds, event.target.value])}>
          <option value="">+ entidade</option>
          {available.map((entity) => (
            <option key={entity.id} value={entity.id}>{entity.name}</option>
          ))}
        </select>
      </div>
    </div>
  )
}
