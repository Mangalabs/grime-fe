import type { PageEstimate, TextStats } from './estimate'
import { defaultCosts, priceAt, type PriceLevel, type ProductionPlan } from './plan'
import { CHARS_PER_LAUDA, costItems, unitLabels, type CostUnit } from './tables'

const money = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const number = (value: number) => value.toLocaleString('pt-BR')

const levelLabels: Record<PriceLevel, string> = { min: 'Mínimo', medio: 'Médio', max: 'Máximo' }

type Update = (change: (current: ProductionPlan) => ProductionPlan) => void

/** What producing the book costs, before printing: fees and editorial work. */
export function CostSection({ stats, estimate, plan, update }: { stats: TextStats; estimate: PageEstimate; plan: ProductionPlan; update: Update }) {
  const laudas = Math.ceil(stats.charsWithSpaces / CHARS_PER_LAUDA)
  const quantity = (unit: CostUnit) => (unit === 'lauda' ? laudas : unit === 'pagina' ? estimate.total : 1)
  const quantityLabel = (unit: CostUnit) =>
    unit === 'lauda' ? `${number(laudas)} laudas` : unit === 'pagina' ? `${number(estimate.total)} páginas` : '1'

  const rows = costItems.map((item) => {
    const line = plan.costs[item.id] ?? { enabled: !item.optional, price: priceAt(item, plan.level) }
    return { item, line, subtotal: line.enabled ? line.price * quantity(item.unit) : 0 }
  })
  const extras = plan.extras.map((extra) => ({ extra, subtotal: extra.price * quantity(extra.unit) }))
  const byGroup = (group: string) => rows.filter((row) => row.item.group === group).reduce((total, row) => total + row.subtotal, 0)
  const extrasTotal = extras.reduce((total, row) => total + row.subtotal, 0)
  const total = rows.reduce((sum, row) => sum + row.subtotal, 0) + extrasTotal
  // The same sheet at the bottom and the top of every range, for scale.
  const rangeTotal = (level: PriceLevel) =>
    rows.reduce((sum, row) => sum + (row.line.enabled ? priceAt(row.item, level) * quantity(row.item.unit) : 0), 0) + extrasTotal

  const setLine = (id: string, patch: Partial<ProductionPlan['costs'][string]>) =>
    update((current) => ({ ...current, costs: { ...current.costs, [id]: { ...current.costs[id], ...patch } } }))
  const setExtra = (id: string, patch: Partial<ProductionPlan['extras'][number]>) =>
    update((current) => ({ ...current, extras: current.extras.map((extra) => (extra.id === id ? { ...extra, ...patch } : extra)) }))

  return (
    <>
      <header className="page-intro admin-intro">
        <p className="eyebrow">Produção</p>
        <h1>Custos de produção</h1>
        <p>
          Taxas e trabalho editorial para levar o texto ao arquivo de gráfica, no formato escolhido ({estimate.format.name},{' '}
          {number(estimate.total)} páginas). Os serviços de texto são cobrados por lauda: {number(CHARS_PER_LAUDA)}{' '}
          caracteres com espaço, o que dá {number(laudas)} laudas neste livro.
        </p>
      </header>

      <ul className="admin-tiles pd-tiles">
        <li className="admin-tile">
          <span className="admin-tile-label">Total estimado</span>
          <strong>{money(total)}</strong>
          <span className="admin-tile-detail">
            entre {money(rangeTotal('min'))} e {money(rangeTotal('max'))}
          </span>
        </li>
        <li className="admin-tile">
          <span className="admin-tile-label">Taxas</span>
          <strong>{money(byGroup('Taxas'))}</strong>
        </li>
        <li className="admin-tile">
          <span className="admin-tile-label">Produção editorial</span>
          <strong>{money(byGroup('Produção editorial') + extrasTotal)}</strong>
        </li>
      </ul>

      <section className="admin-card pd-card">
        <div className="admin-card-head">
          <h2>Planilha</h2>
          <div className="pd-levels" role="group" aria-label="Faixa de preço">
            <span>Preencher com a faixa:</span>
            {(Object.keys(levelLabels) as PriceLevel[]).map((level) => (
              <button
                aria-pressed={plan.level === level}
                className="button button-secondary"
                key={level}
                type="button"
                onClick={() =>
                  update((current) => ({
                    ...current,
                    level,
                    // New prices for every line; which lines are included stays as it was.
                    costs: Object.fromEntries(
                      Object.entries(defaultCosts(level)).map(([id, line]) => [id, { ...line, enabled: current.costs[id]?.enabled ?? line.enabled }]),
                    ),
                  }))
                }
              >
                {levelLabels[level]}
              </button>
            ))}
          </div>
        </div>
        <div className="admin-table-wrap">
          <table className="admin-table pd-table pd-costs">
            <thead>
              <tr>
                <th scope="col">Incluir</th>
                <th scope="col">Item</th>
                <th scope="col">Quantidade</th>
                <th scope="col">Preço unitário</th>
                <th scope="col">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ item, line, subtotal }) => (
                <tr className={line.enabled ? undefined : 'pd-off'} key={item.id}>
                  <td>
                    <input aria-label={`Incluir ${item.name}`} checked={line.enabled} type="checkbox" onChange={(event) => setLine(item.id, { enabled: event.target.checked })} />
                  </td>
                  <th scope="row">
                    {item.name}
                    <span className="pd-sub">
                      {item.group}
                      {item.note ? ` · ${item.note}` : ''} · faixa {item.min === item.max ? money(item.min) : `${money(item.min)} a ${money(item.max)}`}{' '}
                      {unitLabels[item.unit]}
                    </span>
                    {item.sugestao && <span className="pd-badge">sugestão a confirmar</span>}
                  </th>
                  <td>{quantityLabel(item.unit)}</td>
                  <td>
                    <input
                      aria-label={`Preço de ${item.name}`}
                      className="pd-price"
                      min="0"
                      step="0.5"
                      type="number"
                      value={line.price}
                      onChange={(event) => setLine(item.id, { price: Number(event.target.value) || 0 })}
                    />
                  </td>
                  <td>{money(subtotal)}</td>
                </tr>
              ))}
              {extras.map(({ extra, subtotal }) => (
                <tr key={extra.id}>
                  <td>
                    <button
                      aria-label={`Remover ${extra.name || 'item'}`}
                      className="text-button"
                      type="button"
                      onClick={() => update((current) => ({ ...current, extras: current.extras.filter((item) => item.id !== extra.id) }))}
                    >
                      ×
                    </button>
                  </td>
                  <th scope="row">
                    <input aria-label="Nome do item" placeholder="Nome do item" value={extra.name} onChange={(event) => setExtra(extra.id, { name: event.target.value })} />
                    <select aria-label="Unidade" value={extra.unit} onChange={(event) => setExtra(extra.id, { unit: event.target.value as CostUnit })}>
                      {(Object.keys(unitLabels) as CostUnit[]).map((unit) => (
                        <option key={unit} value={unit}>
                          {unitLabels[unit]}
                        </option>
                      ))}
                    </select>
                  </th>
                  <td>{quantityLabel(extra.unit)}</td>
                  <td>
                    <input
                      aria-label={`Preço de ${extra.name || 'item'}`}
                      className="pd-price"
                      min="0"
                      step="0.5"
                      type="number"
                      value={extra.price}
                      onChange={(event) => setExtra(extra.id, { price: Number(event.target.value) || 0 })}
                    />
                  </td>
                  <td>{money(subtotal)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={4}>
                  <button
                    className="text-button"
                    type="button"
                    onClick={() => update((current) => ({ ...current, extras: [...current.extras, { id: crypto.randomUUID(), name: '', unit: 'fixo', price: 0 }] }))}
                  >
                    + Adicionar item
                  </button>
                </td>
                <td>
                  <strong>{money(total)}</strong>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
        <p className="pd-note">
          Valores de referência de mercado; confirme com os profissionais e a CBL. A impressão (tiragem, papel e acabamento)
          ainda não entra nesta conta. A planilha fica guardada neste navegador.
        </p>
      </section>
    </>
  )
}
