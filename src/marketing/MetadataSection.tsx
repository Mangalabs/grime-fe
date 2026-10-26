import { useEffect } from 'react'
import { entityTypeLabel } from '../features/archive/entityModel'
import type { BookMetadata } from './bookMetadata'
import { LevelChip } from './LevelPicker'
import { cutPosition, entityLevel, type MarketingKit } from './marketingKit'
import type { BookMetadataHandle } from './useBookMetadata'
import { slotPositions, type StoryData } from './worldPack'
import './Metadata.css'

const number = (value: number) => value.toLocaleString('pt-BR')
const hours = (minutes: number) =>
  minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h${minutes % 60 ? ` ${minutes % 60} min` : ''}`

/** What the book is, in figures, taken from its own text and Arquivo. */
export function MetadataSection({
  story,
  kit,
  metadata: handle,
}: {
  story: StoryData
  kit: MarketingKit
  metadata: BookMetadataHandle
}) {
  const { state, load } = handle
  useEffect(() => {
    if (state.status === 'idle') void load()
  }, [state.status, load])

  return (
    <>
      <header className="page-intro admin-intro">
        <p className="eyebrow">Marketing</p>
        <h1>Metadados</h1>
        <p>
          O livro em números, tirados do próprio texto e do Arquivo: para a ficha técnica, o catálogo, a imprensa e quem
          for criar o site. O texto é lido aqui no navegador; nada é enviado.
        </p>
      </header>

      {state.status === 'loading' && (
        <p className="admin-muted" role="status">
          {state.progress}
        </p>
      )}
      {state.status === 'error' && (
        <p className="form-message">
          {state.message}{' '}
          <button className="text-button" type="button" onClick={() => void load()}>
            Tentar de novo
          </button>
        </p>
      )}
      {state.status === 'ready' && <MetadataView kit={kit} metadata={state.metadata} story={story} />}
    </>
  )
}

function MetadataView({ metadata, story, kit }: { metadata: BookMetadata; story: StoryData; kit: MarketingKit }) {
  const { prose, structure, world } = metadata
  const cut = cutPosition(kit, slotPositions(story.slots))
  const levelOf = (id: string) => {
    const entity = story.entities.find((item) => item.id === id)
    return entity ? entityLevel(kit, entity, cut).level : 'SPOILER'
  }
  const biggestGroup = Math.max(1, ...structure.groups.map((group) => group.scenes))

  return (
    <div className="mk-meta">
      <section className="admin-card mk-card">
        <h3>Extensão</h3>
        <div className="admin-tiles mk-counts">
          {[
            { label: 'Palavras', value: number(prose.words) },
            { label: 'Páginas (estimadas)', value: number(prose.pages) },
            { label: 'Tempo de leitura', value: hours(prose.readingMinutes) },
            { label: 'Cenas', value: number(structure.scenes) },
            { label: 'Palavras por cena', value: number(prose.wordsPerScene) },
          ].map((tile) => (
            <div className="admin-tile" key={tile.label}>
              <span className="admin-tile-label">{tile.label}</span>
              <strong>{tile.value}</strong>
            </div>
          ))}
        </div>
        <p className="admin-muted">
          Páginas a 250 palavras cada, leitura a 230 palavras por minuto.
          {structure.unplaced > 0 && ` ${structure.unplaced} cena(s) ainda fora da timeline não entram na conta.`}
          {prose.scenesWithText < structure.scenes && ` ${structure.scenes - prose.scenesWithText} cena(s) da timeline ainda sem texto.`}
        </p>
      </section>

      <section className="admin-card mk-card">
        <h3>Estrutura</h3>
        {structure.review ? (
          <dl className="mk-meta-facts">
            <div>
              <dt>Gênero informado</dt>
              <dd>{structure.review.genre || '—'}</dd>
            </div>
            <div>
              <dt>Estrutura informada</dt>
              <dd>{structure.review.declared || '—'}</dd>
            </div>
            <div>
              <dt>Estrutura detectada</dt>
              <dd>{structure.review.detected || '—'}</dd>
            </div>
          </dl>
        ) : (
          <p className="admin-muted">Rode uma revisão do Arquiteto no projeto para ver a estrutura detectada e a curva de tensão.</p>
        )}
        {structure.review && structure.review.tension.length > 1 && <TensionCurve points={structure.review.tension} />}
        {structure.groups.length > 0 && (
          <ul className="mk-meta-groups">
            {structure.groups.map((group) => (
              <li key={group.id}>
                <span>{group.name}</span>
                <span className="mk-meta-bar">
                  <span className={`group-${group.color} is-group`} style={{ width: `${(group.scenes / biggestGroup) * 100}%` }} />
                </span>
                <span className="admin-muted">{group.scenes} cenas</span>
              </li>
            ))}
          </ul>
        )}
        {structure.review && (
          <p className="admin-muted">Revisão do Arquiteto de {new Date(structure.review.date).toLocaleDateString('pt-BR')}.</p>
        )}
      </section>

      <section className="admin-card mk-card">
        <h3>Mundo e elenco</h3>
        <div className="admin-tiles mk-counts">
          {Object.entries(world.byType)
            .sort((a, b) => b[1] - a[1])
            .map(([type, count]) => (
              <div className="admin-tile" key={type}>
                <span className="admin-tile-label">{entityTypeLabel(type)}</span>
                <strong>{number(count)}</strong>
              </div>
            ))}
          <div className="admin-tile">
            <span className="admin-tile-label">Fatos no cânone</span>
            <strong>{number(world.facts)}</strong>
          </div>
        </div>
        <div className="mk-meta-ranks">
          <Ranking items={world.characters} levelOf={levelOf} title="Personagens mais presentes" />
          <Ranking items={world.places} levelOf={levelOf} title="Lugares mais presentes" />
        </div>
        <p className="admin-muted">Presença: cenas em que o Arquivo registrou algo sobre a entidade. O nível ao lado é o de Spoilers.</p>
      </section>

      <section className="admin-card mk-card">
        <h3>Prosa</h3>
        <div className="mk-meta-dialogue">
          <span>Diálogo</span>
          <span className="mk-meta-bar">
            <span style={{ width: `${Math.round(prose.dialogueShare * 100)}%` }} />
          </span>
          <strong>{Math.round(prose.dialogueShare * 100)}%</strong>
        </div>
        <dl className="mk-meta-facts">
          <div>
            <dt>Palavras por frase</dt>
            <dd>{prose.wordsPerSentence.toLocaleString('pt-BR')}</dd>
          </div>
          {prose.longestScene && (
            <div>
              <dt>Cena mais longa</dt>
              <dd>
                Cena {prose.longestScene.order}
                {prose.longestScene.title ? ` · ${prose.longestScene.title}` : ''} ({number(prose.longestScene.words)} palavras)
              </dd>
            </div>
          )}
          {prose.shortestScene && (
            <div>
              <dt>Cena mais curta</dt>
              <dd>
                Cena {prose.shortestScene.order}
                {prose.shortestScene.title ? ` · ${prose.shortestScene.title}` : ''} ({number(prose.shortestScene.words)} palavras)
              </dd>
            </div>
          )}
        </dl>
        <p className="admin-muted">Diálogo: parágrafos que abrem com travessão ou aspas.</p>
      </section>
    </div>
  )
}

function Ranking({
  title,
  items,
  levelOf,
}: {
  title: string
  items: Array<{ id: string; name: string; scenes: number }>
  levelOf: (id: string) => 'PUBLIC' | 'TEASER' | 'SPOILER'
}) {
  const most = Math.max(1, ...items.map((item) => item.scenes))
  return (
    <div>
      <span className="mk-label">{title}</span>
      {items.length === 0 && <p className="admin-muted">Nada registrado ainda.</p>}
      <ol className="mk-meta-rank">
        {items.map((item) => (
          <li key={item.id}>
            <span className="mk-meta-rank-name">{item.name}</span>
            <span className="mk-meta-bar">
              <span style={{ width: `${(item.scenes / most) * 100}%` }} />
            </span>
            <span className="admin-muted">{item.scenes}</span>
            <LevelChip level={levelOf(item.id)} />
          </li>
        ))}
      </ol>
    </div>
  )
}

/** Tension per scene (0–10) from the latest Architect review. */
function TensionCurve({ points }: { points: Array<{ order: number; tension: number }> }) {
  const width = 640
  const height = 120
  const x = (index: number) => (index / (points.length - 1)) * width
  const y = (tension: number) => height - (tension / 10) * height
  const line = points.map((point, index) => `${index ? 'L' : 'M'}${x(index).toFixed(1)} ${y(point.tension).toFixed(1)}`).join(' ')
  const peak = points.reduce((best, point) => (point.tension > best.tension ? point : best), points[0])
  return (
    <figure className="mk-meta-curve">
      <svg aria-label="Curva de tensão por cena" role="img" viewBox={`0 -8 ${width} ${height + 16}`}>
        <path className="mk-meta-curve-area" d={`${line} L${width} ${height} L0 ${height}Z`} />
        <path className="mk-meta-curve-line" d={line} />
        <circle className="mk-meta-curve-peak" cx={x(points.indexOf(peak))} cy={y(peak.tension)} r="5" />
      </svg>
      <figcaption className="admin-muted">
        Tensão por cena, de 0 a 10. Pico na cena {peak.order} ({peak.tension}). A curva fica fora do pacote: mostra onde
        está o clímax.
      </figcaption>
    </figure>
  )
}
