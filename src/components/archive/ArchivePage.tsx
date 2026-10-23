import { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from '../../api/client'
import type { ProjectEntity, ProjectFact, SceneGroup, Slot } from '../../api/contracts'
import { buildArchive } from '../../features/archive/entityModel'
import { relationsAt } from '../../features/archive/relations'
import { EntitiesView } from './EntitiesView'
import { FactsView } from './FactsView'
import { RelationsView } from './RelationsView'
import './Archive.css'

interface ArchivePageProps {
  projectId: string
  slots: Slot[]
  groups: SceneGroup[]
  onOpenScene: (slot: Slot) => void
  onError: (message: string) => void
}

type Tab = 'entities' | 'facts' | 'relations'

export function ArchivePage({ projectId, slots, groups, onOpenScene, onError }: ArchivePageProps) {
  const [entities, setEntities] = useState<ProjectEntity[]>([])
  const [facts, setFacts] = useState<ProjectFact[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('entities')
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!projectId) return
    try {
      const [nextEntities, nextFacts] = await Promise.all([
        api.listProjectEntities(projectId),
        api.listProjectFacts(projectId),
      ])
      setEntities(nextEntities)
      setFacts(nextFacts)
    } catch (reason) {
      onError(reason instanceof Error ? reason.message : 'Não foi possível carregar o arquivo.')
    } finally {
      setIsLoading(false)
    }
  }, [projectId, onError])

  useEffect(() => {
    void Promise.resolve().then(refresh)
  }, [refresh])

  const archive = useMemo(
    () => buildArchive(entities, facts, slots),
    [entities, facts, slots],
  )
  const relationCount = useMemo(() => relationsAt(archive, null).length, [archive])

  function openScene(slotId: string) {
    const slot = slots.find((item) => item.id === slotId)
    if (slot) onOpenScene(slot)
  }

  function openEntity(entityId: string) {
    setSelectedEntityId(entityId)
    setTab('entities')
  }

  if (!projectId) {
    return (
      <section className="panel canon-empty">
        <strong>Selecione um projeto</strong>
        <p>Escolha um projeto para consultar o seu cânone.</p>
      </section>
    )
  }

  const factCount = archive.reduce((total, entity) => total + entity.facts.length, 0)

  return (
    <section className="archive-page">
      <header className="archive-header">
        <div>
          <p className="eyebrow">Cânone do projeto</p>
          <h1>Arquivo</h1>
        </div>
        <div className="archive-tabs" role="tablist" aria-label="Visões do arquivo">
          <button
            aria-controls="archive-panel"
            aria-selected={tab === 'entities'}
            className={tab === 'entities' ? 'is-active' : ''}
            role="tab"
            type="button"
            onClick={() => setTab('entities')}
          >
            Entidades <span>{archive.length}</span>
          </button>
          <button
            aria-controls="archive-panel"
            aria-selected={tab === 'facts'}
            className={tab === 'facts' ? 'is-active' : ''}
            role="tab"
            type="button"
            onClick={() => setTab('facts')}
          >
            Fatos <span>{factCount}</span>
          </button>
          <button
            aria-controls="archive-panel"
            aria-selected={tab === 'relations'}
            className={tab === 'relations' ? 'is-active' : ''}
            role="tab"
            type="button"
            onClick={() => setTab('relations')}
          >
            Relações <span>{relationCount}</span>
          </button>
        </div>
      </header>

      <div id="archive-panel" role="tabpanel">
        {isLoading ? (
          <p className="empty-state">Carregando o arquivo…</p>
        ) : archive.length === 0 ? (
          <section className="panel canon-empty">
            <strong>O arquivo ainda está vazio.</strong>
            <p>Analise uma cena e aprove os fatos extraídos para formar o cânone.</p>
          </section>
        ) : tab === 'entities' ? (
          <EntitiesView
            projectId={projectId}
            archive={archive}
            entities={entities}
            selectedId={selectedEntityId ?? archive[0].id}
            slots={slots}
            onError={onError}
            onOpenScene={openScene}
            onRefresh={refresh}
            onSelect={setSelectedEntityId}
          />
        ) : tab === 'facts' ? (
          <FactsView
            archive={archive}
            slots={slots}
            onOpenEntity={openEntity}
            onOpenScene={openScene}
          />
        ) : (
          <RelationsView
            groups={groups}
            archive={archive}
            projectId={projectId}
            slots={slots}
            onError={onError}
            onOpenEntity={openEntity}
            onOpenScene={openScene}
            onRefresh={refresh}
          />
        )}
      </div>
    </section>
  )
}
