import { useMemo, useState } from 'react'
import { factEntityTypes } from '../api/contracts'
import { attributeLabel } from '../features/archive/attributes'
import { entityTypeLabel, type ArchiveEntity } from '../features/archive/entityModel'
import { normalizeForSearch } from '../features/scenes/sceneStatus'
import { fichaSections, shownValue } from './ficha'
import { LevelChip, LevelPicker } from './LevelPicker'
import {
  aliasLevel,
  cutPosition,
  entityLevel,
  factLevel,
  spoilerLevelDescriptions,
  spoilerLevelLabels,
  spoilerLevels,
  summaryFieldId,
  summaryLevel,
  wikiFieldLevel,
  withLevel,
  withWikiLevel,
  type MarketingKit,
  type SpoilerLevel,
} from './marketingKit'
import { slotPositions, timeline, type StoryData } from './worldPack'

export function SpoilersSection({
  story,
  kit,
  onChange,
}: {
  story: StoryData
  kit: MarketingKit
  onChange: (kit: MarketingKit) => void
}) {
  const [query, setQuery] = useState('')
  const [type, setType] = useState<string>('ALL')
  const [onlyWithFicha, setOnlyWithFicha] = useState(false)
  // Entities with a ficha first: they carry most of what a site can use.
  const sorted = useMemo(
    () => [...story.entities].sort((a, b) => Number(story.pages.has(b.id)) - Number(story.pages.has(a.id))),
    [story.entities, story.pages],
  )
  const [selectedId, setSelectedId] = useState<string | null>(sorted[0]?.id ?? null)

  const ordered = useMemo(() => timeline(story.slots), [story.slots])
  const cut = cutPosition(kit, slotPositions(story.slots))
  const orderOf = useMemo(() => new Map(ordered.map((slot, index) => [slot.id, index + 1])), [ordered])

  const needle = normalizeForSearch(query.trim())
  const entities = sorted.filter(
    (entity) =>
      (type === 'ALL' || entity.type === type) &&
      (!onlyWithFicha || story.pages.has(entity.id)) &&
      (!needle ||
        [entity.name, ...entity.aliases.map((alias) => alias.name)].some((name) => normalizeForSearch(name).includes(needle))),
  )
  const selected = story.entities.find((entity) => entity.id === selectedId) ?? null

  return (
    <>
      <header className="page-intro admin-intro">
        <p className="eyebrow">Marketing</p>
        <h1>Spoilers</h1>
        <p>
          O que o público pode saber deste livro, a começar pelas fichas do Arquivo. Só entra no pacote o que for
          público (ou teaser, se você escolher); spoilers nunca saem do Petricor.
        </p>
      </header>

      <section className="admin-card mk-cut">
        <label>
          <strong>O público conhece até a cena</strong>
          <span className="admin-muted admin-note">
            Por exemplo, o fim dos capítulos de amostra. Entidades e fatos até ela começam como públicos; o resto, como
            spoiler. Você ajusta um a um abaixo.
          </span>
          <select
            value={kit.publicThroughSlotId ?? ''}
            onChange={(event) => onChange({ ...kit, publicThroughSlotId: event.target.value || null })}
          >
            <option value="">Nenhuma ainda: tudo começa como spoiler</option>
            {ordered.map((slot, index) => (
              <option key={slot.id} value={slot.id}>
                {`Cena ${index + 1}${slot.title ? ` · ${slot.title}` : ''}`}
              </option>
            ))}
          </select>
        </label>
        <dl className="mk-legend">
          {spoilerLevels.map((level) => (
            <div key={level}>
              <dt>
                <LevelChip level={level} />
              </dt>
              <dd>{spoilerLevelDescriptions[level]}</dd>
            </div>
          ))}
        </dl>
      </section>

      <div className="mk-split">
        <aside className="mk-entity-list">
          <div className="mk-filters">
            <input
              aria-label="Buscar no Arquivo"
              placeholder="Buscar nome ou apelido"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <select aria-label="Tipo de entidade" value={type} onChange={(event) => setType(event.target.value)}>
              <option value="ALL">Todos os tipos</option>
              {factEntityTypes.map((item) => (
                <option key={item} value={item}>
                  {entityTypeLabel(item)}
                </option>
              ))}
            </select>
            <label className="admin-toggle">
              <input checked={onlyWithFicha} type="checkbox" onChange={(event) => setOnlyWithFicha(event.target.checked)} />
              <span>Só com ficha</span>
            </label>
          </div>
          {entities.length === 0 && <p className="empty-state">Nenhuma entidade encontrada.</p>}
          <ul>
            {entities.map((entity) => (
              <li key={entity.id}>
                <button
                  aria-current={entity.id === selectedId ? 'true' : undefined}
                  type="button"
                  onClick={() => setSelectedId(entity.id)}
                >
                  <span>
                    <strong>{entity.name}</strong>
                    <span className="admin-muted admin-note">
                      {entityTypeLabel(entity.type)}
                      {story.pages.has(entity.id) && ' · ficha'}
                    </span>
                  </span>
                  <LevelChip level={entityLevel(kit, entity, cut).level} />
                </button>
              </li>
            ))}
          </ul>
        </aside>

        {selected ? (
          <EntityDetail cut={cut} entity={selected} kit={kit} orderOf={orderOf} story={story} onChange={onChange} />
        ) : (
          <p className="empty-state">O Arquivo deste projeto ainda está vazio.</p>
        )}
      </div>
    </>
  )
}

function EntityDetail({
  story,
  kit,
  entity,
  cut,
  orderOf,
  onChange,
}: {
  story: StoryData
  kit: MarketingKit
  entity: ArchiveEntity
  cut: number | null
  orderOf: Map<string, number>
  onChange: (kit: MarketingKit) => void
}) {
  const own = entityLevel(kit, entity, cut)
  const facts = entity.facts.filter((fact) => fact.isActive)
  const isSecret = own.level === 'SPOILER'

  return (
    <section className="mk-detail">
      <header className="admin-card mk-detail-head">
        <div>
          <p className="eyebrow">{entityTypeLabel(entity.type)}</p>
          <h2>{entity.name}</h2>
          {isSecret && (
            <p className="admin-muted">
              Enquanto a entidade for spoiler, nada dela entra no pacote: nem a ficha, nem os fatos, nem as menções a
              ela nas fichas e fatos de outras entidades.
            </p>
          )}
        </div>
        <LevelPicker
          label={`Nível de ${entity.name}`}
          resolved={own}
          onChange={(level) => onChange(withLevel(kit, 'entities', entity.id, level))}
        />
      </header>

      <FichaCard entity={entity} entityLevel={own.level} kit={kit} story={story} onChange={onChange} />

      {entity.aliases.length > 0 && (
        <section className="admin-card">
          <h3>Outros nomes</h3>
          <p className="admin-muted">Começam como spoiler: um segundo nome costuma ser o segredo.</p>
          <ul className="mk-rows">
            {entity.aliases.map((alias) => (
              <li key={alias.id}>
                <span>{alias.name}</span>
                <LevelPicker
                  label={`Nível do nome ${alias.name}`}
                  resolved={aliasLevel(kit, alias.id)}
                  onChange={(level) => onChange(withLevel(kit, 'aliases', alias.id, level))}
                />
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="admin-card">
        <h3>Fatos do cânone</h3>
        {facts.length === 0 && <p className="admin-muted">Nenhum fato ativo.</p>}
        <ul className="mk-rows">
          {facts.map((fact) => {
            const order = orderOf.get(fact.slot.id)
            return (
              <li key={fact.id}>
                <span>
                  <span className="admin-muted">{attributeLabel(fact.attributeKey)}</span> {fact.value}
                  <span className="admin-muted admin-note">
                    {order ? `Cena ${order}` : 'Fora da timeline'}
                    {fact.isSubjective && fact.sourceClaim ? ` · segundo ${fact.sourceClaim}` : ''}
                  </span>
                </span>
                <LevelPicker
                  label={`Nível do fato ${fact.value}`}
                  resolved={factLevel(kit, fact, cut)}
                  onChange={(level) => onChange(withLevel(kit, 'facts', fact.id, level))}
                />
              </li>
            )
          })}
        </ul>
      </section>

      <p className="admin-muted mk-footnote">
        O nível efetivo é o mais restrito entre o item e a entidade: um campo público de uma entidade{' '}
        {spoilerLevelLabels.TEASER.toLowerCase()} entra como teaser.
      </p>
    </section>
  )
}

function FichaCard({
  story,
  kit,
  entity,
  entityLevel: ownLevel,
  onChange,
}: {
  story: StoryData
  kit: MarketingKit
  entity: ArchiveEntity
  entityLevel: SpoilerLevel
  onChange: (kit: MarketingKit) => void
}) {
  const page = story.pages.get(entity.id)
  const allNames = useMemo(() => new Map(story.entities.map((item) => [item.id, item.name])), [story.entities])
  if (!page) {
    return (
      <section className="admin-card">
        <h3>Ficha</h3>
        <p className="admin-muted">
          Esta entidade ainda não tem ficha. Fichas são a fonte mais rica para o site: aparência, voz, atmosfera.
          Crie a ficha no Arquivo do projeto.
        </p>
      </section>
    )
  }
  const sections = fichaSections(story.library, entity, page)

  return (
    <section className="admin-card">
      <h3>Ficha</h3>
      <p className="admin-muted">
        Campos de apresentação (nome, aparência, voz, atmosfera…) seguem a entidade; objetivo e medo começam como
        teaser; o resto é planejamento do livro e começa como spoiler.
      </p>

      {page.summary.trim() && (
        <ul className="mk-rows">
          <li>
            <span>
              Resumo
              <span className="mk-field-value">{page.summary.trim()}</span>
            </span>
            <LevelPicker
              label="Nível do resumo"
              resolved={summaryLevel(kit, entity.id)}
              onChange={(level) => onChange(withWikiLevel(kit, entity.id, [summaryFieldId], level))}
            />
          </li>
        </ul>
      )}

      {sections.length === 0 && !page.summary.trim() && <p className="admin-muted">A ficha ainda está em branco.</p>}

      {sections.map((section) => (
        <div className="mk-ficha-section" key={section.id}>
          <div className="mk-ficha-section-head">
            <h4>{section.title || 'Seção sem título'}</h4>
            <span className="mk-section-apply">
              <span className="admin-muted">Toda a seção:</span>
              {spoilerLevels.map((level) => (
                <button
                  className="text-button"
                  key={level}
                  type="button"
                  onClick={() =>
                    onChange(withWikiLevel(kit, entity.id, section.fields.map(({ field }) => field.id), level))
                  }
                >
                  {spoilerLevelLabels[level]}
                </button>
              ))}
              <button
                className="text-button"
                type="button"
                onClick={() => onChange(withWikiLevel(kit, entity.id, section.fields.map(({ field }) => field.id), null))}
              >
                Padrão
              </button>
            </span>
          </div>
          <ul className="mk-rows">
            {section.fields.map(({ field, value }) => {
              const shown = shownValue(field, value, allNames)
              const text = shown ? (Array.isArray(shown.value) ? shown.value.join(' · ') : shown.value) : ''
              return (
                <li key={field.id}>
                  <span>
                    <span className="admin-muted">{field.label}</span>
                    <span className="mk-field-value">{text}</span>
                  </span>
                  <LevelPicker
                    label={`Nível do campo ${field.label}`}
                    resolved={wikiFieldLevel(kit, entity.id, field.id, ownLevel)}
                    onChange={(level) => onChange(withWikiLevel(kit, entity.id, [field.id], level))}
                  />
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </section>
  )
}
