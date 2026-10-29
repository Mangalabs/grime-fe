import { useEffect, useMemo, useRef, useState } from 'react'
import type { Slot } from '../../api/contracts'
import {
  entityStateAt,
  entityTypeLabel,
  looseFacts,
  scenePositions,
  type ArchiveEntity,
  type ArchiveFact,
  type DuplicateHint,
} from '../../features/archive/entityModel'
import { attributeLabel } from '../../features/archive/attributes'
import { EntityBonds } from './EntityBonds'
import { TrajectoryView } from './TrajectoryView'
import { orderScenes, sceneTitle } from '../../features/scenes/sceneStatus'
import type { Wiki } from '../../features/wiki/useWiki'
import { ChevronLeftIcon, ChevronRightIcon } from '../icons'
import { SceneStrip } from '../SceneStrip'
import { EntityWikiPage } from '../wiki/EntityWikiPage'
import '../wiki/Wiki.css'

// page: the author's wiki page. canon: what the analysed scenes established.
export type SheetTab = 'page' | 'canon' | 'trajectory'

interface EntitySheetProps {
  archive: ArchiveEntity[]
  entity: ArchiveEntity
  hints: DuplicateHint[]
  slots: Slot[]
  isMutating: boolean
  wiki: Wiki | null
  tab: SheetTab
  startEditing: boolean
  onTabChange: (tab: SheetTab) => void
  onEditTemplate: (templateId: string) => void
  onDirtyChange: (isDirty: boolean) => void
  onOpenScene: (slotId: string) => void
  onSelectEntity: (entityId: string) => void
  onMerge: (target: ArchiveEntity, source: ArchiveEntity) => void
  onReconcile: () => void
  // Resolves to whether the new name was saved.
  onRename: (name: string) => Promise<boolean>
  onMakePreferred: (alias: { id: string; name: string }) => void
  onDetachAlias: (alias: { id: string; name: string }) => void
  onDelete: () => void
}

function sceneLabel(fact: ArchiveFact): string {
  return fact.position === null ? 'Cena avulsa' : `Cena ${fact.position + 1}`
}

// The more complete name absorbs the shorter one ("Julien" → "Julien Vane").
function mergeDirection(a: ArchiveEntity, b: ArchiveEntity): [ArchiveEntity, ArchiveEntity] {
  if (a.name.length !== b.name.length) return a.name.length > b.name.length ? [a, b] : [b, a]
  return a.facts.length >= b.facts.length ? [a, b] : [b, a]
}

export function EntitySheet({
  archive,
  entity,
  hints,
  slots,
  isMutating,
  wiki,
  tab,
  startEditing,
  onTabChange,
  onEditTemplate,
  onDirtyChange,
  onOpenScene,
  onSelectEntity,
  onMerge,
  onReconcile,
  onRename,
  onMakePreferred,
  onDetachAlias,
  onDelete,
}: EntitySheetProps) {
  const [draftName, setDraftName] = useState<string | null>(null)
  const [openAlias, setOpenAlias] = useState<string | null>(null)
  const aliasMenuRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!openAlias) return
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent ? event.key === 'Escape' : !aliasMenuRef.current?.contains(event.target as Node)) {
        setOpenAlias(null)
      }
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', close)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', close)
    }
  }, [openAlias])
  const scenes = useMemo(
    () => orderScenes(slots).filter((slot) => !slot.isUnanchored),
    [slots],
  )
  const positions = useMemo(() => scenePositions(entity), [entity])
  const [isFollowing, setIsFollowing] = useState(false)
  // Cursor on the timeline (scene index); starts at the entity's last scene.
  const [cursor, setCursor] = useState<number>(() => positions.at(-1) ?? 0)

  const upTo = isFollowing ? cursor : null
  const states = useMemo(() => entityStateAt(entity, upTo), [entity, upTo])
  const loose = looseFacts(entity)
  const byId = useMemo(() => new Map(archive.map((item) => [item.id, item])), [archive])

  function targetChip(targetId: string | null) {
    const target = targetId ? byId.get(targetId) : undefined
    return target ? (
      <button className="relation-chip" type="button" onClick={() => onSelectEntity(target.id)}>
        → {target.name}
      </button>
    ) : null
  }
  const sceneCount = new Set(entity.facts.map((fact) => fact.slot.id)).size
  const isCharacter = entity.type === 'CHARACTER'
  const previousAppearance = [...positions].reverse().find((position) => position < cursor)
  const nextAppearance = positions.find((position) => position > cursor)
  const cursorScene = scenes[cursor]

  function sceneButton(fact: ArchiveFact) {
    return (
      <button
        className="inline-link entity-scene-link"
        title={`Abrir no editor: ${fact.slot.title ?? 'Cena sem título'}`}
        type="button"
        onClick={() => onOpenScene(fact.slot.id)}
      >
        {sceneLabel(fact)}
      </button>
    )
  }

  return (
    <article className="entity-sheet" aria-labelledby="entity-sheet-title">
      <header className="entity-sheet-header">
        <div>
          <p className="eyebrow">
            <span className={`entity-type-dot type-${entity.type.toLowerCase()}`} aria-hidden="true" />
            {entityTypeLabel(entity.type)}
          </p>
          {draftName === null ? (
            <div className="entity-name-row">
              <h2 id="entity-sheet-title">{entity.name}</h2>
              <button
                className="text-button entity-rename"
                disabled={isMutating}
                type="button"
                onClick={() => setDraftName(entity.name)}
              >
                Renomear
              </button>
            </div>
          ) : (
            <form
              className="entity-rename-form"
              onSubmit={(event) => {
                event.preventDefault()
                const name = draftName.trim()
                if (!name || name === entity.name) {
                  setDraftName(null)
                  return
                }
                void onRename(name).then((ok) => {
                  if (ok) setDraftName(null)
                })
              }}
            >
              <label className="sr-only" htmlFor="entity-rename-input">
                Nome principal
              </label>
              <input
                autoFocus
                id="entity-rename-input"
                value={draftName}
                onChange={(event) => setDraftName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') setDraftName(null)
                }}
              />
              <button className="button button-primary button-small" disabled={isMutating} type="submit">
                Salvar
              </button>
              <button className="text-button" type="button" onClick={() => setDraftName(null)}>
                Cancelar
              </button>
            </form>
          )}
          {entity.aliases.length > 0 && (
            <div className="entity-aliases" ref={aliasMenuRef}>
              <span>Também chamado:</span>
              <ul>
                {entity.aliases.map((alias) => (
                  <li key={alias.id}>
                    <button
                      aria-expanded={openAlias === alias.id}
                      aria-haspopup="menu"
                      className="entity-alias-chip"
                      disabled={isMutating}
                      type="button"
                      onClick={() => setOpenAlias(openAlias === alias.id ? null : alias.id)}
                    >
                      {alias.name} <span aria-hidden="true">▾</span>
                    </button>
                    {openAlias === alias.id && (
                      <div className="entity-alias-menu" role="menu">
                        <button
                          role="menuitem"
                          type="button"
                          onClick={() => {
                            setOpenAlias(null)
                            onMakePreferred(alias)
                          }}
                        >
                          <strong>Tornar nome principal</strong>
                          <span>“{entity.name}” passa a ser um apelido</span>
                        </button>
                        <button
                          role="menuitem"
                          type="button"
                          onClick={() => {
                            setOpenAlias(null)
                            onDetachAlias(alias)
                          }}
                        >
                          <strong>Desvincular este nome</strong>
                          <span>Desfaz a união: vira uma entidade separada</span>
                        </button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <p className="entity-summary">
            {entity.facts.length} {entity.facts.length === 1 ? 'fato' : 'fatos'} em {sceneCount}{' '}
            {sceneCount === 1 ? 'cena' : 'cenas'}
          </p>
        </div>
        <div className="entity-sheet-actions">
          <button className="button button-secondary button-small" type="button" onClick={onReconcile}>
            Unir ou separar…
          </button>
          <button className="text-button destructive" disabled={isMutating} type="button" onClick={onDelete}>
            Excluir…
          </button>
        </div>
      </header>

      {hints.length > 0 && (
        <ul className="entity-hints">
          {hints.map((hint) => (
            <li className={`entity-hint hint-${hint.kind}`} key={hint.other.id}>
              {hint.kind === 'likely' ? (
                <>
                  <span>
                    Pode ser a mesma entidade que <strong>{hint.other.name}</strong>.
                  </span>
                  <button
                    className="button button-secondary button-small"
                    disabled={isMutating}
                    type="button"
                    onClick={() => onMerge(...mergeDirection(entity, hint.other))}
                  >
                    Unir as duas
                  </button>
                </>
              ) : (
                <span>
                  Também existe <strong>{hint.other.name}</strong> como{' '}
                  {entityTypeLabel(hint.other.type).toLocaleLowerCase('pt-BR')}.
                </span>
              )}
              <button className="text-button" type="button" onClick={() => onSelectEntity(hint.other.id)}>
                Ver {hint.other.name}
              </button>
            </li>
          ))}
        </ul>
      )}

      {(wiki || isCharacter) && (
        <div className="archive-tabs entity-sheet-tabs" role="tablist" aria-label="Visões da entidade">
          {wiki && (
            <button
              aria-controls="entity-page-panel"
              aria-selected={tab === 'page'}
              className={tab === 'page' ? 'is-active' : ''}
              role="tab"
              type="button"
              onClick={() => onTabChange('page')}
            >
              Ficha
            </button>
          )}
          <button
            aria-controls="entity-canon-panel"
            aria-selected={tab === 'canon'}
            className={tab === 'canon' ? 'is-active' : ''}
            role="tab"
            type="button"
            onClick={() => onTabChange('canon')}
          >
            Cânone <span>{entity.facts.length}</span>
          </button>
          {isCharacter && (
            <button
              aria-controls="entity-trajectory-panel"
              aria-selected={tab === 'trajectory'}
              className={tab === 'trajectory' ? 'is-active' : ''}
              role="tab"
              type="button"
              onClick={() => onTabChange('trajectory')}
            >
              Trajetória
            </button>
          )}
        </div>
      )}

      {isCharacter && tab === 'trajectory' && (
        <div id="entity-trajectory-panel" role="tabpanel">
          <TrajectoryView
            archive={archive}
            entity={entity}
            hasPage={Boolean(wiki?.pageIds.has(entity.id))}
            wiki={wiki}
            onOpenScene={onOpenScene}
            onSelectEntity={onSelectEntity}
          />
        </div>
      )}

      {wiki && (
        <div hidden={tab !== 'page'} id="entity-page-panel" role="tabpanel">
          <EntityWikiPage
            archive={archive}
            entity={entity}
            startEditing={startEditing}
            wiki={wiki}
            onDirtyChange={onDirtyChange}
            onEditTemplate={onEditTemplate}
            onOpenScene={onOpenScene}
            onSelectEntity={onSelectEntity}
          />
        </div>
      )}

      <div className="entity-canon" hidden={tab !== 'canon'} id="entity-canon-panel" role={wiki || isCharacter ? 'tabpanel' : undefined}>
      {scenes.length > 0 && positions.length > 0 && (
        <section className="entity-timeline" aria-label="Linha do tempo da entidade">
          <label className="switch">
            <input
              checked={isFollowing}
              role="switch"
              type="checkbox"
              onChange={(event) => setIsFollowing(event.target.checked)}
            />
            <span className="switch-track" aria-hidden="true" />
            Acompanhar pela timeline
          </label>
          {isFollowing && (
            <>
              <SceneStrip
                describe={(slot) =>
                  positions.includes(scenes.indexOf(slot))
                    ? `Com fatos de ${entity.name}`
                    : `Sem fatos de ${entity.name}`
                }
                label={`Cenas da linha do tempo; destacadas as que têm fatos de ${entity.name}`}
                scenes={scenes}
                selectedId={cursorScene?.id ?? null}
                stateOf={(slot) => (positions.includes(scenes.indexOf(slot)) ? 'clean' : 'unanalyzed')}
                onSelect={(slot) => setCursor(scenes.indexOf(slot))}
              />
              <div className="entity-cursor">
                <button
                  aria-label="Cena anterior com fatos desta entidade"
                  className="scene-nav-step"
                  disabled={previousAppearance === undefined}
                  type="button"
                  onClick={() => previousAppearance !== undefined && setCursor(previousAppearance)}
                >
                  <ChevronLeftIcon />
                </button>
                <p>
                  Estado na <strong>cena {cursor + 1}</strong>
                  {cursorScene && <span> · {sceneTitle(cursorScene)}</span>}
                </p>
                <button
                  aria-label="Próxima cena com fatos desta entidade"
                  className="scene-nav-step"
                  disabled={nextAppearance === undefined}
                  type="button"
                  onClick={() => nextAppearance !== undefined && setCursor(nextAppearance)}
                >
                  <ChevronRightIcon />
                </button>
              </div>
            </>
          )}
        </section>
      )}

      <section aria-labelledby="entity-state-title">
        <h3 className="entity-section-title" id="entity-state-title">
          {isFollowing ? `Até a cena ${cursor + 1}` : 'Estado atual'}
        </h3>
        {states.length === 0 ? (
          <p className="archive-empty">
            {isFollowing
              ? `${entity.name} ainda não aparece até esta cena.`
              : 'Nenhum fato na timeline para esta entidade.'}
          </p>
        ) : (
          <dl className="entity-state">
            {states.map((state) => (
              <div className={`entity-attribute${state.changedAtCursor ? ' is-changed' : ''}`} key={state.key}>
                <dt>{state.label}</dt>
                <dd>
                  {state.current.length === 0 ? (
                    <p className="entity-value is-empty">Sem valor ativo</p>
                  ) : (
                    state.current.map((fact) => (
                      <p className="entity-value" key={fact.id}>
                        {fact.value}
                        {targetChip(fact.targetId)}
                        {fact.isSubjective && (
                          <span className="entity-tag">segundo {fact.sourceClaim ?? 'alguém'}</span>
                        )}
                      </p>
                    ))
                  )}
                  <p className="entity-value-meta">
                    {state.current[0] && sceneButton(state.current[0])}
                    {state.changedAtCursor && <span className="entity-tag tag-accent">mudou nesta cena</span>}
                  </p>
                  {state.history.length > state.current.length && (
                    <details className="entity-history">
                      <summary>Histórico ({state.history.length})</summary>
                      <ol>
                        {state.history.map((fact) => (
                          <li className={fact.isActive ? '' : 'is-replaced'} key={fact.id}>
                            {sceneButton(fact)}
                            <span>{fact.value}</span>
                            {!fact.isActive && <span className="entity-tag">substituído</span>}
                            {fact.isSubjective && (
                              <span className="entity-tag">segundo {fact.sourceClaim ?? 'alguém'}</span>
                            )}
                          </li>
                        ))}
                      </ol>
                    </details>
                  )}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </section>

      <EntityBonds archive={archive} entity={entity} upTo={upTo} onOpenScene={onOpenScene} onSelectEntity={onSelectEntity} />

      {loose.length > 0 && (
        <section aria-labelledby="entity-loose-title">
          <h3 className="entity-section-title" id="entity-loose-title">
            Em cenas avulsas
          </h3>
          <ul className="entity-loose">
            {loose.map((fact) => (
              <li key={fact.id}>
                <span className="entity-loose-attribute">{attributeLabel(fact.attribute)}</span>
                <span>{fact.value}</span>
                <button className="inline-link entity-scene-link" type="button" onClick={() => onOpenScene(fact.slot.id)}>
                  {fact.slot.title ?? 'Cena avulsa'}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      </div>
    </article>
  )
}
