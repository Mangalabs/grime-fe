import { useState } from 'react'
import type { StoryData } from './worldPack'

/** Words as removable chips; Enter or comma adds one. */
export function TagInput({
  label,
  values,
  placeholder,
  onChange,
}: {
  label: string
  values: string[]
  placeholder?: string
  onChange: (values: string[]) => void
}) {
  const [draft, setDraft] = useState('')

  function add() {
    const items = draft
      .split(',')
      .map((item) => item.trim())
      .filter((item) => item && !values.includes(item))
    if (items.length) onChange([...values, ...items])
    setDraft('')
  }

  return (
    <div className="mk-tags">
      <span className="mk-label">{label}</span>
      <div className="mk-tags-box">
        {values.map((value) => (
          <span className="mk-tag" key={value}>
            {value}
            <button aria-label={`Remover ${value}`} type="button" onClick={() => onChange(values.filter((item) => item !== value))}>
              ×
            </button>
          </span>
        ))}
        <input
          aria-label={label}
          placeholder={values.length ? '' : placeholder}
          value={draft}
          onBlur={add}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ',') {
              event.preventDefault()
              add()
            } else if (event.key === 'Backspace' && !draft && values.length) {
              onChange(values.slice(0, -1))
            }
          }}
        />
      </div>
    </div>
  )
}

export function Field({
  label,
  hint,
  value,
  multiline,
  placeholder,
  onChange,
}: {
  label: string
  hint?: string
  value: string
  multiline?: boolean
  placeholder?: string
  onChange: (value: string) => void
}) {
  return (
    <label className="mk-field">
      <span className="mk-label">{label}</span>
      {hint && <span className="admin-muted admin-note">{hint}</span>}
      {multiline ? (
        <textarea placeholder={placeholder} rows={3} value={value} onChange={(event) => onChange(event.target.value)} />
      ) : (
        <input placeholder={placeholder} value={value} onChange={(event) => onChange(event.target.value)} />
      )}
    </label>
  )
}

export function EntitySelect({
  story,
  value,
  label,
  onChange,
}: {
  story: StoryData
  value: string | null
  label: string
  onChange: (entityId: string | null) => void
}) {
  return (
    <label className="mk-field">
      <span className="mk-label">{label}</span>
      <select value={value ?? ''} onChange={(event) => onChange(event.target.value || null)}>
        <option value="">Nenhuma</option>
        {[...story.entities]
          .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
          .map((entity) => (
            <option key={entity.id} value={entity.id}>
              {entity.name}
            </option>
          ))}
      </select>
    </label>
  )
}
