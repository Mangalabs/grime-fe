import { useEffect, useState, type ReactNode } from 'react'
import { api } from '../api/client'
import type { AuthUser, Project } from '../api/contracts'
import { initialTheme } from '../features/theme'
import { AccountMenu } from './AccountMenu'
import { ProjectUnlockModal } from './ProjectUnlockModal'

export interface OpenProject {
  project: Project
  key: CryptoKey
}

interface WorkspaceShellProps<Section extends string> {
  user: AuthUser
  onLogout: () => void
  // The workspace's name: badge, eyebrow and tab title ("Petricor · name").
  name: string
  home: string
  // Accessible names, which need the right article in Portuguese.
  brandLabel: string
  navLabel: string
  sections: Record<Section, string>
  // Shown again whenever another project is opened.
  firstSection: Section
  // Heading and text shown until a project is open.
  intro: ReactNode
  children: (open: OpenProject, section: Section) => ReactNode
}

/**
 * The frame of a standalone workspace (/marketing, /producao): its top bar
 * with section tabs, choosing and unlocking a project with its password, and
 * an introduction until one is open. The workspace itself renders inside.
 */
export function WorkspaceShell<Section extends string>({
  user,
  onLogout,
  name,
  home,
  brandLabel,
  navLabel,
  sections,
  firstSection,
  intro,
  children,
}: WorkspaceShellProps<Section>) {
  const [projects, setProjects] = useState<Project[] | null>(null)
  const [error, setError] = useState('')
  const [toUnlock, setToUnlock] = useState<string | null>(null)
  const [open, setOpen] = useState<OpenProject | null>(null)
  const [section, setSection] = useState<Section>(firstSection)

  useEffect(() => {
    document.documentElement.dataset.theme = initialTheme()
    document.title = `Petricor · ${name}`
    api
      .listProjects()
      .then(setProjects)
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Não foi possível listar os projetos.'))
  }, [name])

  return (
    <div className="admin-shell">
      <header className="admin-topbar">
        <a className="brand" href={home} aria-label={brandLabel}>
          <span className="brand-mark" aria-hidden="true">P</span>
          <span>Petricor</span>
          <span className="admin-badge">{name}</span>
        </a>
        {open && (
          <nav className="admin-nav" aria-label={navLabel}>
            {(Object.keys(sections) as Section[]).map((item) => (
              <button aria-current={section === item ? 'page' : undefined} key={item} type="button" onClick={() => setSection(item)}>
                {sections[item]}
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
          children(open, section)
        ) : (
          <header className="page-intro admin-intro">
            <p className="eyebrow">{name}</p>
            {intro}
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
            setSection(firstSection)
            setToUnlock(null)
          }}
        />
      )}
    </div>
  )
}
