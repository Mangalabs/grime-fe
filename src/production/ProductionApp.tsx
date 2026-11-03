import { useMemo } from 'react'
import type { AuthUser, Project } from '../api/contracts'
import { WorkspaceShell } from '../components/WorkspaceShell'
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
  return (
    <WorkspaceShell
      brandLabel="Produção do Petricor"
      firstSection="format"
      home="/producao"
      intro={
        <>
          <h1>Do manuscrito ao livro impresso</h1>
          <p>
            Formato, número de páginas, a configuração do documento no Affinity e quanto custa produzir o livro. O texto
            é lido aqui no navegador, depois de desbloquear o projeto; nada é enviado.
          </p>
        </>
      }
      name="Produção"
      navLabel="Seções da produção"
      sections={sectionLabels}
      user={user}
      onLogout={onLogout}
    >
      {(open, section) => <Workspace key={open.project.id} project={open.project} projectKey={open.key} section={section} />}
    </WorkspaceShell>
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
