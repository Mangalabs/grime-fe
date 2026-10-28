import { useState } from 'react'
import type { PageEstimate } from './estimate'
import type { ProductionPlan } from './plan'
import { fonts, formats, margins, papers } from './tables'

const PT_TO_MM = 25.4 / 72
const mm = (value: number) => `${(Math.round(value * 10) / 10).toLocaleString('pt-BR')} mm`
const pt = (value: number) => `${value.toLocaleString('pt-BR')} pt`
// Bleed on the inside pages (top, bottom, outside) and around the cover.
const BLEED_MM = 3
const COVER_BLEED_MM = 5

/** The document settings to type into Affinity Publisher for the chosen format. */
export function AffinitySection({ estimate, plan }: { estimate: PageEstimate; plan: ProductionPlan }) {
  const [copied, setCopied] = useState(false)
  const { format, margins: margin } = estimate
  const typography = plan.layout.typography
  const font = fonts.find((item) => item.id === typography.fontId) ?? fonts[0]
  const paper = papers.find((item) => item.id === plan.layout.paperId) ?? papers[0]

  const groups: Array<{ title: string; rows: Array<[string, string]> }> = [
    {
      title: 'Documento',
      rows: [
        ['Tamanho da página', `${format.widthMm} × ${format.heightMm} mm (${format.name})`],
        ['Páginas faceadas', 'Sim, começando pela direita'],
        ['Número de páginas', `${estimate.total}`],
        ['DPI', '300'],
        ['Sangria', `${mm(BLEED_MM)} em cima, embaixo e na externa; 0 na interna`],
        ['Colunas', '1'],
      ],
    },
    {
      title: 'Margens',
      rows: [
        ['Interna (lado da lombada)', mm(margin.inner)],
        ['Externa', mm(margin.outer)],
        ['Superior', mm(margin.top)],
        ['Inferior', mm(margin.bottom)],
        ['Mancha de texto', `${mm(estimate.textBlock.widthMm)} × ${mm(estimate.textBlock.heightMm)}`],
      ],
    },
    {
      title: 'Texto do miolo',
      rows: [
        ['Fonte', font.name],
        ['Corpo / entrelinha', `${pt(typography.sizePt)} / ${pt(typography.leadingPt)}`],
        ['Grade de linha de base', `${pt(typography.leadingPt)} de espaçamento, começando na margem superior`],
        ['Recuo da primeira linha', `${mm(typography.sizePt * PT_TO_MM)} (1 eme)`],
        ['Alinhamento', 'Justificado, última linha à esquerda'],
        ['Hifenização', 'Português (Brasil)'],
        ['Viúvas e órfãs', 'Evitar (mínimo de 2 linhas)'],
        ['Por página (estimado)', `${estimate.linesPerPage} linhas de ${estimate.charsPerLine} caracteres`],
      ],
    },
    {
      title: 'Capa (para quem fizer o projeto gráfico)',
      rows: [
        ['Papel do miolo', paper.name],
        ['Lombada estimada', mm(estimate.spineMm)],
        [
          'Capa aberta, sem orelhas',
          `${mm(format.widthMm * 2 + estimate.spineMm)} × ${mm(format.heightMm)}, mais ${mm(COVER_BLEED_MM)} de sangria em volta`,
        ],
      ],
    },
  ]

  const asText = groups.map((group) => [group.title.toUpperCase(), ...group.rows.map(([label, value]) => `${label}: ${value}`)].join('\n')).join('\n\n')

  return (
    <>
      <header className="page-intro admin-intro">
        <p className="eyebrow">Produção</p>
        <h1>Configuração no Affinity</h1>
        <p>
          Os valores para criar o documento no Affinity Publisher no formato escolhido ({format.name}, {estimate.total}{' '}
          páginas). As margens seguem a tabela abaixo: a interna cresce com o número de páginas, porque um livro mais grosso
          curva mais perto da lombada.
        </p>
      </header>

      <div className="pd-affinity">
        {groups.map((group) => (
          <section className="admin-card pd-card" key={group.title}>
            <h2>{group.title}</h2>
            <dl className="pd-settings">
              {group.rows.map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
      <p>
        <button
          className="button button-secondary"
          type="button"
          onClick={() =>
            void navigator.clipboard.writeText(asText).then(() => {
              setCopied(true)
              window.setTimeout(() => setCopied(false), 2000)
            })
          }
        >
          {copied ? 'Copiado' : 'Copiar como texto'}
        </button>
      </p>

      <section className="admin-card pd-card">
        <h2>Tabela de margens</h2>
        <div className="admin-table-wrap">
          <table className="admin-table pd-table">
            <thead>
              <tr>
                <th scope="col">Formato</th>
                <th scope="col">Páginas</th>
                <th scope="col">Interna</th>
                <th scope="col">Externa</th>
                <th scope="col">Topo / base</th>
              </tr>
            </thead>
            <tbody>
              {margins.map((row, index) => {
                const previous = margins.slice(0, index).filter((other) => other.formats.join() === row.formats.join()).at(-1)
                const from = previous ? previous.upToPages + 1 : 1
                const names = row.formats.map((id) => formats.find((item) => item.id === id)).filter((item) => !!item)
                const isCurrent = row === margin
                return (
                  <tr className={isCurrent ? 'pd-chosen' : undefined} key={index}>
                    <th scope="row">
                      {names.map((item) => `${(item.widthMm / 10).toLocaleString('pt-BR')} × ${(item.heightMm / 10).toLocaleString('pt-BR')}`).join(' ou ')} cm
                      {row.sugestao && <span className="pd-badge">sugestão a confirmar</span>}
                    </th>
                    <td>{row.upToPages === Infinity ? `${from} ou mais` : from === 1 ? `até ${row.upToPages}` : `${from} a ${row.upToPages}`}</td>
                    <td>{mm(row.inner)}</td>
                    <td>{mm(row.outer)}</td>
                    <td>
                      {mm(row.top)} / {mm(row.bottom)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <p className="pd-note">
          As linhas marcadas como sugestão completam a tabela da casa (formatos de bolso, novela e livros acima da faixa).
          Os valores ficam em <code>src/production/tables.ts</code>.
        </p>
      </section>
    </>
  )
}
