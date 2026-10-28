import type { PageEstimate, TextStats } from './estimate'
import type { ProductionPlan } from './plan'
import { CHARS_PER_LAUDA, fonts, papers, type FormatId, type PaperId } from './tables'

const number = (value: number) => value.toLocaleString('pt-BR')
const cm = (mm: number) => (mm / 10).toLocaleString('pt-BR')

const fitLabels: Record<PageEstimate['fit'], string> = {
  abaixo: 'Abaixo da faixa',
  dentro: 'Dentro da faixa',
  acima: 'Acima da faixa',
}

type Update = (change: (current: ProductionPlan) => ProductionPlan) => void

/** How many pages, in which format: every format compared, one chosen. */
export function FormatSection({
  title,
  stats,
  genre,
  plan,
  ranked,
  recommendedId,
  chosen,
  update,
  reset,
}: {
  title: string
  stats: TextStats
  genre: string
  plan: ProductionPlan
  ranked: Array<{ result: PageEstimate; matchesGenre: boolean }>
  recommendedId: FormatId | null
  chosen: PageEstimate
  update: Update
  reset: () => void
}) {
  const { layout } = plan
  const typography = layout.typography
  const setLayout = (patch: Partial<ProductionPlan['layout']>) => update((current) => ({ ...current, layout: { ...current.layout, ...patch } }))
  const setType = (patch: Partial<ProductionPlan['layout']['typography']>) =>
    update((current) => ({ ...current, layout: { ...current.layout, typography: { ...current.layout.typography, ...patch } } }))
  const numberInput = (value: string, fallback: number) => (Number.isFinite(Number(value)) && value !== '' ? Number(value) : fallback)

  return (
    <>
      <header className="page-intro admin-intro">
        <p className="eyebrow">Produção · {title}</p>
        <h1>Formato e páginas</h1>
        <p>
          O texto é diagramado por estimativa: cada parágrafo vira linhas na mancha do formato (página menos margens), na
          fonte e no corpo escolhidos. Capítulos abrem página nova com o título rebaixado, e as páginas pré e pós-textuais
          entram antes de completar os cadernos.
        </p>
      </header>

      <ul className="admin-tiles pd-tiles">
        <li className="admin-tile">
          <span className="admin-tile-label">Caracteres com espaço</span>
          <strong>{number(stats.charsWithSpaces)}</strong>
        </li>
        <li className="admin-tile">
          <span className="admin-tile-label">Laudas</span>
          <strong>{number(Math.ceil(stats.charsWithSpaces / CHARS_PER_LAUDA))}</strong>
          <span className="admin-tile-detail">de {number(CHARS_PER_LAUDA)} caracteres</span>
        </li>
        <li className="admin-tile">
          <span className="admin-tile-label">Parágrafos</span>
          <strong>{number(stats.paragraphs)}</strong>
          <span className="admin-tile-detail">{Math.round(stats.dialogueShare * 100)}% do texto em diálogo</span>
        </li>
        <li className="admin-tile">
          <span className="admin-tile-label">Escolhido</span>
          <strong>
            {chosen.format.name} · {number(chosen.total)} p.
          </strong>
          <span className="admin-tile-detail">
            {cm(chosen.format.widthMm)} × {cm(chosen.format.heightMm)} cm · ≈ {number(chosen.charsPerPage)} caracteres por página
          </span>
        </li>
      </ul>

      <section className="admin-card pd-card">
        <div className="admin-card-head">
          <h2>Tipografia e montagem</h2>
          <button className="text-button" type="button" onClick={reset}>
            Restaurar padrões
          </button>
        </div>
        <div className="pd-fields">
          <label className="pd-field">
            <span>Fonte do miolo</span>
            <select value={typography.fontId} onChange={(event) => setType({ fontId: event.target.value })}>
              {fonts.map((font) => (
                <option key={font.id} value={font.id}>
                  {font.name}
                </option>
              ))}
            </select>
          </label>
          <label className="pd-field">
            <span>Corpo (pt)</span>
            <input min="7" max="16" step="0.5" type="number" value={typography.sizePt} onChange={(event) => setType({ sizePt: numberInput(event.target.value, typography.sizePt) })} />
          </label>
          <label className="pd-field">
            <span>Entrelinha (pt)</span>
            <input min="8" max="24" step="0.5" type="number" value={typography.leadingPt} onChange={(event) => setType({ leadingPt: numberInput(event.target.value, typography.leadingPt) })} />
          </label>
          <label className="pd-field">
            <span>Caracteres por linha medidos</span>
            <input
              min="20"
              max="120"
              placeholder="estimado pela fonte"
              type="number"
              value={typography.measuredCharsPerLine ?? ''}
              onChange={(event) => setType({ measuredCharsPerLine: event.target.value ? Number(event.target.value) : null })}
            />
            <small>Depois de diagramar uma página de teste, conte e informe aqui: a estimativa passa a usar o valor real.</small>
          </label>
          <label className="pd-field">
            <span>Capítulos</span>
            <select value={layout.chapterMode} onChange={(event) => setLayout({ chapterMode: event.target.value as ProductionPlan['layout']['chapterMode'] })}>
              <option value="cena">Cada cena é um capítulo ({number(stats.scenes.length)})</option>
              <option value="grupo" disabled={!stats.groups}>
                Cada grupo é um capítulo ({number(stats.groups)})
              </option>
              <option value="continuo">Texto corrido, cenas separadas por * * *</option>
            </select>
          </label>
          <label className="pd-field">
            <span>Abertura de capítulo</span>
            <select value={layout.chapterStart} onChange={(event) => setLayout({ chapterStart: event.target.value as ProductionPlan['layout']['chapterStart'] })}>
              <option value="nova-pagina">Em página nova</option>
              <option value="impar">Sempre em página ímpar (à direita)</option>
            </select>
          </label>
          <label className="pd-field">
            <span>Páginas pré-textuais</span>
            <input min="0" type="number" value={layout.frontPages} onChange={(event) => setLayout({ frontPages: numberInput(event.target.value, layout.frontPages) })} />
            <small>Falsa folha de rosto, rosto, créditos e ficha, dedicatória, epígrafe, sumário.</small>
          </label>
          <label className="pd-field">
            <span>Páginas pós-textuais</span>
            <input min="0" type="number" value={layout.backPages} onChange={(event) => setLayout({ backPages: numberInput(event.target.value, layout.backPages) })} />
            <small>Agradecimentos, sobre o autor, colofão.</small>
          </label>
          <label className="pd-field">
            <span>Impressão</span>
            <select value={layout.roundTo} onChange={(event) => setLayout({ roundTo: Number(event.target.value) })}>
              <option value={16}>Offset: cadernos de 16 páginas</option>
              <option value={8}>Offset: cadernos de 8 páginas</option>
              <option value={4}>Digital / sob demanda: múltiplos de 4</option>
            </select>
          </label>
          <label className="pd-field">
            <span>Papel do miolo</span>
            <select value={layout.paperId} onChange={(event) => setLayout({ paperId: event.target.value as PaperId })}>
              {papers.map((paper) => (
                <option key={paper.id} value={paper.id}>
                  {paper.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section className="admin-card pd-card">
        <div className="admin-card-head">
          <h2>Formatos comparados</h2>
          {genre && <span className="admin-muted">Gênero: {genre}</span>}
        </div>
        <div className="admin-table-wrap">
          <table className="admin-table pd-table">
            <thead>
              <tr>
                <th scope="col">Formato</th>
                <th scope="col">Páginas</th>
                <th scope="col">Por página</th>
                <th scope="col">Lombada</th>
                <th scope="col">Faixa ideal</th>
                <th scope="col">
                  <span className="sr-only">Escolher</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {ranked.map(({ result, matchesGenre }) => {
                const isChosen = result.format.id === chosen.format.id
                return (
                  <tr aria-current={isChosen ? 'true' : undefined} className={isChosen ? 'pd-chosen' : undefined} key={result.format.id}>
                    <th scope="row">
                      <strong>{result.format.name}</strong>
                      <span className="pd-sub">
                        {cm(result.format.widthMm)} × {cm(result.format.heightMm)} cm · {result.format.use}
                      </span>
                      <span className="pd-badges">
                        {result.format.id === recommendedId && <span className="pd-badge pd-badge-strong">Recomendado</span>}
                        {matchesGenre && <span className="pd-badge">Combina com o gênero</span>}
                      </span>
                    </th>
                    <td>
                      <strong>{number(result.total)}</strong>
                      <span className="pd-sub">
                        {number(result.bodyPages)} de texto · {number(result.blankPages)} em branco
                      </span>
                    </td>
                    <td>
                      ≈ {number(result.charsPerPage)} car.
                      <span className="pd-sub">
                        {result.linesPerPage} linhas × {result.charsPerLine} car. ({number(result.fullPageChars)} cheia)
                      </span>
                    </td>
                    <td>{result.spineMm.toLocaleString('pt-BR')} mm</td>
                    <td>
                      <span className={`pd-fit pd-fit-${result.fit}`}>{fitLabels[result.fit]}</span>
                      <span className="pd-sub">
                        {number(result.format.minPages)}–{number(result.format.maxPages)} p. · {result.format.ergonomics}
                      </span>
                    </td>
                    <td>
                      {isChosen ? (
                        <span className="pd-badge pd-badge-strong">Escolhido</span>
                      ) : (
                        <button className="button button-secondary" type="button" onClick={() => update((current) => ({ ...current, formatId: result.format.id }))}>
                          Escolher
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {plan.formatId && plan.formatId !== recommendedId && (
          <p className="admin-muted">
            Você escolheu um formato diferente do recomendado.{' '}
            <button className="text-button" type="button" onClick={() => update((current) => ({ ...current, formatId: null }))}>
              Seguir a recomendação
            </button>
          </p>
        )}
        <p className="pd-note">
          Estimativa: a largura média de caractere de cada fonte é aproximada, e o resultado varia até cerca de 10% com a
          hifenização e o ajuste fino da diagramação. Lombada calculada pela espessura do papel escolhido.
        </p>
      </section>
    </>
  )
}
