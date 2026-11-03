import { useEffect, useState } from 'react'
import { api } from '../api/client'
import type { AuthUser, Project } from '../api/contracts'
import { WorkspaceShell } from '../components/WorkspaceShell'
import { BookSection } from './BookSection'
import type { DraftState } from './DraftCard'
import { IdentitySection } from './IdentitySection'
import type { MarketingKit } from './marketingKit'
import { PackSection } from './PackSection'
import { useMoodboardImages } from './useMoodboardImages'
import { MetadataSection } from './MetadataSection'
import { useBookMetadata } from './useBookMetadata'
import { SpoilersSection } from './SpoilersSection'
import { useMarketingStory } from './useMarketingStory'
import '../App.css'
import '../admin/Admin.css'
import './Marketing.css'

type Section = 'book' | 'metadata' | 'identity' | 'spoilers' | 'pack'

const sectionLabels: Record<Section, string> = {
  book: 'Livro',
  metadata: 'Metadados',
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
  return (
    <WorkspaceShell
      brandLabel="Marketing do Petricor"
      firstSection="book"
      home="/marketing"
      intro={
        <>
          <h1>Escolha um projeto</h1>
          <p>
            Defina o que o público pode saber do livro e exporte o pacote que alimenta o site. O projeto é aberto
            com a senha dele, como no Petricor: tudo é decifrado aqui no navegador.
          </p>
        </>
      }
      name="Marketing"
      navLabel="Seções do marketing"
      sections={sectionLabels}
      user={user}
      onLogout={onLogout}
    >
      {(open, section) => <Workspace key={open.project.id} project={open.project} projectKey={open.key} section={section} />}
    </WorkspaceShell>
  )
}

function Workspace({ project, projectKey, section }: { project: Project; projectKey: CryptoKey; section: Section }) {
  const { story, kit, error, saveKit } = useMarketingStory(project.id, project.title, projectKey)
  const images = useMoodboardImages(project.id, projectKey)
  // Computed once, when Metadados or Pacote first needs it.
  const metadata = useBookMetadata(project.id, projectKey, story)
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
      {section === 'metadata' && <MetadataSection kit={current} metadata={metadata} story={story} />}
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
      {section === 'pack' && <PackSection hasUnsavedChanges={isDirty} images={images} kit={current} metadata={metadata} story={story} />}
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
