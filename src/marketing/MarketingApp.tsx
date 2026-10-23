import { useEffect, useState } from 'react'
import { api } from '../api/client'
import type { AuthUser, Project } from '../api/contracts'
import { AccountMenu } from '../components/AccountMenu'
import { ProjectUnlockModal } from '../components/ProjectUnlockModal'
import { initialTheme } from '../features/theme'
import { BookSection } from './BookSection'
import type { DraftState } from './DraftCard'
import { IdentitySection } from './IdentitySection'
import type { MarketingKit } from './marketingKit'
import { PackSection } from './PackSection'
import { useMoodboardImages } from './useMoodboardImages'
import { SpoilersSection } from './SpoilersSection'
import { useMarketingStory } from './useMarketingStory'
import '../App.css'
import '../admin/Admin.css'
import './Marketing.css'

type Section = 'book' | 'identity' | 'spoilers' | 'pack'

const sectionLabels: Record<Section, string> = {
  book: 'Livro',
  identity: 'Identidade',
  spoilers: 'Spoilers',
  pack: 'Pacote',
}

// Every uploaded image the kit points to: moodboard, cover, author photo.
const assetIds = (kit: MarketingKit | null) =>
  new Set(
    [...(kit?.identity.moodboard ?? []), kit?.book.cover, kit?.book.authorPhoto]
      .filter((image) => !!image)
      .map((image) => image!.assetId),
  )

// Its own shell, like /admin: the writing and review screens never show any
// of this, and nothing here changes the manuscript, the Arquivo or the wiki.
export default function MarketingApp({ user, onLogout }: { user: AuthUser; onLogout: () => void }) {
  const [projects, setProjects] = useState<Project[] | null>(null)
  const [error, setError] = useState('')
  const [toUnlock, setToUnlock] = useState<string | null>(null)
  const [open, setOpen] = useState<{ project: Project; key: CryptoKey } | null>(null)
  const [section, setSection] = useState<Section>('book')

  useEffect(() => {
    document.documentElement.dataset.theme = initialTheme()
    document.title = 'Petricor · Marketing'
    api
      .listProjects()
      .then(setProjects)
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Não foi possível listar os projetos.'))
  }, [])

  return (
    <div className="admin-shell">
      <header className="admin-topbar">
        <a className="brand" href="/marketing" aria-label="Marketing do Petricor">
          <span className="brand-mark" aria-hidden="true">P</span>
          <span>Petricor</span>
          <span className="admin-badge">Marketing</span>
        </a>
        {open && (
          <nav className="admin-nav" aria-label="Seções do marketing">
            {(Object.keys(sectionLabels) as Section[]).map((item) => (
              <button
                aria-current={section === item ? 'page' : undefined}
                key={item}
                type="button"
                onClick={() => setSection(item)}
              >
                {sectionLabels[item]}
              </button>
            ))}
          </nav>
        )}
        <div className="admin-topbar-end">
          {projects && projects.length > 0 && (
            <select
              aria-label="Projeto"
              className="mk-project-select"
              value={open?.project.id ?? ''}
              onChange={(event) => {
                if (event.target.value) setToUnlock(event.target.value)
              }}
            >
              {!open && <option value="">Escolha um projeto</option>}
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.title}
                </option>
              ))}
            </select>
          )}
          <a className="text-button admin-back" href="/">
            Voltar ao Petricor
          </a>
          <AccountMenu user={user} onLogout={onLogout} />
        </div>
      </header>

      <main className="admin-main">
        {error && <p className="form-message">{error}</p>}
        {open ? (
          <Workspace key={open.project.id} project={open.project} projectKey={open.key} section={section} />
        ) : (
          <header className="page-intro admin-intro">
            <p className="eyebrow">Marketing</p>
            <h1>Escolha um projeto</h1>
            <p>
              Defina o que o público pode saber do livro e exporte o pacote que alimenta o site. O projeto é aberto
              com a senha dele, como no Petricor: tudo é decifrado aqui no navegador.
            </p>
            {projects?.length === 0 && <p className="empty-state">Você ainda não tem projetos.</p>}
          </header>
        )}
      </main>

      {toUnlock && (
        <ProjectUnlockModal
          projectId={toUnlock}
          onClose={() => setToUnlock(null)}
          onUnlocked={(projectId, key) => {
            const project = projects?.find((item) => item.id === projectId)
            if (project) setOpen({ project, key })
            setSection('book')
            setToUnlock(null)
          }}
        />
      )}
    </div>
  )
}

function Workspace({ project, projectKey, section }: { project: Project; projectKey: CryptoKey; section: Section }) {
  const { story, kit, error, saveKit } = useMarketingStory(project.id, project.title, projectKey)
  const images = useMoodboardImages(project.id, projectKey)
  // Kept here, not in the section: a paid draft survives switching tabs.
  const [draftState, setDraftState] = useState<DraftState | null>(null)
  // Changes on screen, saved with the bar below.
  const [draft, setDraft] = useState<MarketingKit | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const current = draft ?? kit
  const isDirty = draft !== null && draft !== kit

  useEffect(() => {
    if (!isDirty) return
    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [isDirty])

  // Images are uploaded right away but only belong to the kit once it's saved:
  // whatever one side has and the other doesn't is deleted from the server.
  function deleteAssets(ids: Iterable<string>) {
    for (const id of ids) void api.deleteMarketingAsset(project.id, id).catch(() => undefined)
  }

  async function save() {
    if (!draft) return
    setIsSaving(true)
    setSaveError('')
    const kept = assetIds(draft)
    const removed = [...assetIds(kit)].filter((id) => !kept.has(id))
    try {
      await saveKit(draft)
      setDraft(null)
      deleteAssets(removed)
    } catch (reason) {
      setDraft(null)
      setSaveError(reason instanceof Error ? reason.message : 'Não foi possível salvar.')
    } finally {
      setIsSaving(false)
    }
  }

  function discard() {
    const saved = assetIds(kit)
    deleteAssets([...assetIds(draft)].filter((id) => !saved.has(id)))
    setDraft(null)
  }

  if (error) return <p className="form-message">{error}</p>
  if (!story || !current) return <p className="admin-muted" role="status">Abrindo o projeto…</p>

  return (
    <>
      {saveError && <p className="form-message">{saveError}</p>}
      {section === 'book' && (
        <BookSection
          book={current.book}
          identity={current.identity}
          images={images}
          projectTitle={project.title}
          onChange={(book) => setDraft((previous) => ({ ...(previous ?? current), book }))}
        />
      )}
      {section === 'identity' && (
        <IdentitySection
          draftState={draftState}
          images={images}
          kit={current}
          projectId={project.id}
          projectKey={projectKey}
          story={story}
          onDraftState={setDraftState}
          onChange={(identity) => setDraft((previous) => ({ ...(previous ?? current), identity }))}
        />
      )}
      {section === 'spoilers' && <SpoilersSection kit={current} story={story} onChange={setDraft} />}
      {section === 'pack' && <PackSection hasUnsavedChanges={isDirty} images={images} kit={current} story={story} />}
      {isDirty && (
        <div className="mk-save-bar" role="status">
          <span>Alterações do marketing ainda não salvas.</span>
          <span className="admin-card-actions">
            <button className="text-button" disabled={isSaving} type="button" onClick={discard}>
              Descartar
            </button>
            <button className="button button-primary button-small" disabled={isSaving} type="button" onClick={() => void save()}>
              {isSaving ? 'Salvando…' : 'Salvar'}
            </button>
          </span>
        </div>
      )}
    </>
  )
}
