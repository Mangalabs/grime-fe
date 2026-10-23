import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../../api/client'
import type { FactEntityType, ProjectEntity, ProjectFact, SceneGroup, Slot } from '../../api/contracts'
import { buildArchive } from '../../features/archive/entityModel'
import { relationsAt } from '../../features/archive/relations'
import { useWiki } from '../../features/wiki/useWiki'
import { WikiTemplatesView } from '../wiki/WikiTemplatesView'
import { EntitiesView } from './EntitiesView'
import { FactsView } from './FactsView'
import { NewEntityDialog } from './NewEntityDialog'
import { RelationsView } from './RelationsView'
import './Archive.css'

interface ArchivePageProps {
  projectId: string
  projectKey: CryptoKey | null
  slots: Slot[]
  groups: SceneGroup[]
  onOpenScene: (slot: Slot) => void
  onError: (message: string) => void
}

type Tab = 'entities' | 'facts' | 'relations' | 'templates'

// The server's refusals of a new entity, in the author's language.
function createErrorMessage(reason: unknown) {
  const message = reason instanceof Error ? reason.message : ''
  if (/restore it instead/i.test(message)) return 'Uma entidade excluída tem esse nome: restaure-a em “Excluídas”.'
  if (/alias of another entity/i.test(message)) return 'Esse nome já é um apelido de outra entidade.'
  if (/already has this name/i.test(message)) return 'Já existe uma entidade desse tipo com esse nome.'
  return message || 'Não foi possível criar a entidade.'
}

export function ArchivePage({ projectId, projectKey, slots, groups, onOpenScene, onError }: ArchivePageProps) {
  const [entities, setEntities] = useState<ProjectEntity[]>([])
  const [facts, setFacts] = useState<ProjectFact[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('entities')
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null)
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null)
  // The entity just created by hand: its page opens for editing.
  const [createdEntityId, setCreatedEntityId] = useState<string | null>(null)
  const [newEntityType, setNewEntityType] = useState<FactEntityType | null>(null)
  const wiki = useWiki(projectId, projectKey)
  // A page or the templates being edited, so leaving them asks first.
  const hasUnsavedRef = useRef(false)
  const setUnsaved = useCallback((isDirty: boolean) => {
    hasUnsavedRef.current = isDirty
  }, [])
  const confirmLeave = useCallback(
    () => !hasUnsavedRef.current || window.confirm('Descartar as alterações não salvas?'),
    [],
  )

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
    if (!confirmLeave()) return
    setSelectedEntityId(entityId)
    setTab('entities')
  }

  function changeTab(next: Tab) {
    if (next === tab || !confirmLeave()) return
    setTab(next)
  }

  function editTemplate(templateId: string) {
    if (!confirmLeave()) return
    setSelectedTemplateId(templateId)
    setTab('templates')
  }

  async function createEntity(name: string, type: FactEntityType) {
    let created: { id: string }
    try {
      created = await api.createEntity(projectId, { name, type })
    } catch (reason) {
      throw new Error(createErrorMessage(reason))
    }
    await refresh()
    setNewEntityType(null)
    setCreatedEntityId(created.id)
    setSelectedEntityId(created.id)
    setTab('entities')
  }

  function openNewEntity(type: FactEntityType = 'CHARACTER') {
    if (confirmLeave()) setNewEntityType(type)
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
            onClick={() => changeTab('entities')}
          >
            Entidades <span>{archive.length}</span>
          </button>
          <button
            aria-controls="archive-panel"
            aria-selected={tab === 'facts'}
            className={tab === 'facts' ? 'is-active' : ''}
            role="tab"
            type="button"
            onClick={() => changeTab('facts')}
          >
            Fatos <span>{factCount}</span>
          </button>
          <button
            aria-controls="archive-panel"
            aria-selected={tab === 'relations'}
            className={tab === 'relations' ? 'is-active' : ''}
            role="tab"
            type="button"
            onClick={() => changeTab('relations')}
          >
            Relações <span>{relationCount}</span>
          </button>
          {wiki.isAvailable && (
            <button
              aria-controls="archive-panel"
              aria-selected={tab === 'templates'}
              className={tab === 'templates' ? 'is-active' : ''}
              role="tab"
              type="button"
              onClick={() => changeTab('templates')}
            >
              Modelos
            </button>
          )}
        </div>
      </header>

      <div id="archive-panel" role="tabpanel">
        {isLoading ? (
          <p className="empty-state">Carregando o arquivo…</p>
        ) : tab === 'templates' && wiki.library ? (
          <WikiTemplatesView
            library={wiki.library}
            selectedId={selectedTemplateId}
            onDirtyChange={setUnsaved}
            onSave={wiki.saveLibrary}
            onSelect={setSelectedTemplateId}
          />
        ) : archive.length === 0 ? (
          <section className="panel canon-empty">
            <strong>O arquivo ainda está vazio.</strong>
            <p>
              Analise uma cena e aprove os fatos extraídos para formar o cânone, ou crie entidades à mão para
              planejar personagens, locais e regras antes de escrever.
            </p>
            <button className="button button-primary" type="button" onClick={() => openNewEntity()}>
              Nova entidade
            </button>
          </section>
        ) : tab === 'entities' || tab === 'templates' ? (
          <EntitiesView
            projectId={projectId}
            archive={archive}
            entities={entities}
            selectedId={selectedEntityId ?? archive[0].id}
            slots={slots}
            startEditingId={createdEntityId}
            wiki={wiki.isAvailable && projectKey ? wiki : null}
            confirmLeave={confirmLeave}
            onCreateEntity={openNewEntity}
            onDirtyChange={setUnsaved}
            onEditTemplate={editTemplate}
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

      {newEntityType && (
        <NewEntityDialog initialType={newEntityType} onClose={() => setNewEntityType(null)} onCreate={createEntity} />
      )}
    </section>
  )
}
