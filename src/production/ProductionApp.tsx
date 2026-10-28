import { useEffect, useMemo, useState } from 'react'
import { api } from '../api/client'
import type { AuthUser, Project } from '../api/contracts'
import { AccountMenu } from '../components/AccountMenu'
import { ProjectUnlockModal } from '../components/ProjectUnlockModal'
import { initialTheme } from '../features/theme'
import { AffinitySection } from './AffinitySection'
import { CostSection } from './CostSection'
import { estimate, rankFormats } from './estimate'
import { FormatSection } from './FormatSection'
import { useProductionPlan } from './plan'
import { useBookText } from './useBookText'
import '../App.css'
import '../admin/Admin.css'
import './Production.css'

type Section = 'format' | 'affinity' | 'costs'

const sectionLabels: Record<Section, string> = {
  format: 'Formato e páginas',
  affinity: 'Affinity',
  costs: 'Custos',
}

// From manuscript to printed book: format, page count, layout settings and
// what producing it costs. Its own shell, like /marketing; nothing here
// changes the manuscript.
export default function ProductionApp({ user, onLogout }: { user: AuthUser; onLogout: () => void }) {
  const [projects, setProjects] = useState<Project[] | null>(null)
  const [error, setError] = useState('')
  const [toUnlock, setToUnlock] = useState<string | null>(null)
  const [open, setOpen] = useState<{ project: Project; key: CryptoKey } | null>(null)
  const [section, setSection] = useState<Section>('format')

  useEffect(() => {
    document.documentElement.dataset.theme = initialTheme()
    document.title = 'Petricor · Produção'
    api
      .listProjects()
      .then(setProjects)
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Não foi possível listar os projetos.'))
  }, [])

  return (
    <div className="admin-shell">
      <header className="admin-topbar">
        <a className="brand" href="/producao" aria-label="Produção do Petricor">
          <span className="brand-mark" aria-hidden="true">P</span>
          <span>Petricor</span>
          <span className="admin-badge">Produção</span>
        </a>
        {open && (
          <nav className="admin-nav" aria-label="Seções da produção">
            {(Object.keys(sectionLabels) as Section[]).map((item) => (
              <button aria-current={section === item ? 'page' : undefined} key={item} type="button" onClick={() => setSection(item)}>
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
            <p className="eyebrow">Produção</p>
            <h1>Do manuscrito ao livro impresso</h1>
            <p>
              Formato, número de páginas, a configuração do documento no Affinity e quanto custa produzir o livro. O texto
              é lido aqui no navegador, depois de desbloquear o projeto; nada é enviado.
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
            setSection('format')
            setToUnlock(null)
          }}
        />
      )}
    </div>
  )
}

function Workspace({ project, projectKey, section }: { project: Project; projectKey: CryptoKey; section: Section }) {
  const text = useBookText(project.id, projectKey)
  const { plan, update, reset } = useProductionPlan(project.id)
  const stats = text.status === 'ready' ? text.stats : null
  const genre = text.status === 'ready' ? text.genre : ''

  // Every format, best first; the chosen one, or the best if none is chosen.
  const ranked = useMemo(() => (stats ? rankFormats(stats, plan.layout, genre) : []), [stats, plan.layout, genre])
  const recommended = ranked.find((item) => item.result.fit === 'dentro') ?? ranked[0]
  const chosen = useMemo(
    () => (stats && plan.formatId ? estimate(stats, plan.formatId, plan.layout) : (recommended?.result ?? null)),
    [stats, plan.formatId, plan.layout, recommended],
  )

  if (text.status === 'loading') {
    return (
      <p className="admin-muted" role="status">
        {text.progress}
      </p>
    )
  }
  if (text.status === 'error') return <p className="form-message">{text.message}</p>
  if (!stats || !chosen) return null
  if (!stats.charsWithSpaces) {
    return <p className="empty-state">As cenas da linha do tempo ainda não têm texto. Escreva ou importe o manuscrito primeiro.</p>
  }

  return (
    <>
      {section === 'format' && (
        <FormatSection
          chosen={chosen}
          genre={genre}
          plan={plan}
          ranked={ranked}
          recommendedId={recommended?.result.format.id ?? null}
          stats={stats}
          title={project.title}
          update={update}
          reset={reset}
        />
      )}
      {section === 'affinity' && <AffinitySection estimate={chosen} plan={plan} />}
      {section === 'costs' && <CostSection estimate={chosen} plan={plan} stats={stats} update={update} />}
    </>
  )
}
