import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { api } from '../../api/client'
import type { ArchitectReview, ProjectEntity, SceneGroup, SceneMetric, Slot } from '../../api/contracts'
import { loadSceneTexts } from '../../features/manuscript/loadSceneTexts'
import {
  beatLabels,
  castPresence,
  factsPerScene,
  groupShares,
  longestRun,
  measureScene,
  median,
  rangeLabel,
  similarOpenings,
} from '../../features/rhythm/metrics'
import { groupRuns } from '../../features/scenes/groups'
import { orderScenes, sceneTitle } from '../../features/scenes/sceneStatus'
import type { StripBand } from '../SceneStrip'
import '../SceneStrip.css'
import './RhythmPage.css'
import { RhythmChart } from './RhythmChart'

interface RhythmPageProps {
  projectId: string
  projectKey: CryptoKey | null
  slots: Slot[]
  groups: SceneGroup[]
  onOpenScene: (slot: Slot) => void
  onOpenArchitect: () => void
}

interface Loaded {
  key: string
  texts: string[]
  entities: ProjectEntity[] | null
  report: ArchitectReview | null
}

type CastFilter = 'CHARACTER' | 'LOCATION' | 'ALL'

const castFilters: Record<CastFilter, string> = {
  CHARACTER: 'Personagens',
  LOCATION: 'Lugares',
  ALL: 'Todas as entidades',
}

const percent = (value: number) => `${Math.round(value * 100)}%`
const number = (value: number) => value.toLocaleString('pt-BR')
const dateFormat = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

/**
 * "Ritmo e tensão": how the work moves scene by scene. Text measures are
 * computed in this browser from the decrypted scenes; the tension curve comes
 * from the latest architectural review that scored it.
 */
export function RhythmPage({ projectId, projectKey, slots, groups, onOpenScene, onOpenArchitect }: RhythmPageProps) {
  const scenes = useMemo(() => orderScenes(slots).filter((slot) => !slot.isUnanchored), [slots])
  const sceneKey = `${projectId}:${scenes.map((slot) => slot.id).join(',')}`
  const [reloads, setReloads] = useState(0)
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<number | null>(null)
  const [hovered, setHovered] = useState<number | null>(null)
  const [castFilter, setCastFilter] = useState<CastFilter>('CHARACTER')

  useEffect(() => {
    if (!projectKey || scenes.length === 0) return
    let isCurrent = true
    const key = `${sceneKey}#${reloads}`
    Promise.all([
      loadSceneTexts(projectKey, scenes, (done, total) => {
        if (isCurrent) setProgress({ done, total })
      }),
      api.listProjectEntities(projectId).catch(() => null),
      api
        .listArchitecturalReviews(projectId)
        .then((reports) => reports.find((report) => report.sceneMetrics?.length) ?? null)
        .catch(() => null),
    ])
      .then(([texts, entities, report]) => {
        if (!isCurrent) return
        setLoaded({ key, texts, entities, report })
        setError(null)
      })
      .catch((reason: unknown) => {
        if (isCurrent) setError(reason instanceof Error ? reason.message : 'Não foi possível ler as cenas.')
      })
      .finally(() => {
        if (isCurrent) setProgress(null)
      })
    return () => {
      isCurrent = false
    }
    // The scene list is captured by its key; titles changing don't reload texts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, projectKey, sceneKey, reloads])

  const data = loaded && loaded.key.startsWith(`${sceneKey}#`) ? loaded : null

  const analysis = useMemo(() => {
    if (!data) return null
    const metrics = data.texts.map(measureScene)
    const words = metrics.map((metric) => metric.words)
    const totalWords = words.reduce((a, b) => a + b, 0)
    const dialogueWords = metrics.reduce((sum, metric) => sum + metric.dialogueShare * metric.words, 0)
    const sentenceCount = metrics.reduce((sum, metric) => sum + metric.sentences, 0)

    // Tension per current scene index, following the report's own numbering.
    let tension: Array<SceneMetric | null> | null = null
    if (data.report?.sceneMetrics?.length) {
      const index = new Map(scenes.map((slot, position) => [slot.id, position]))
      tension = new Array<SceneMetric | null>(scenes.length).fill(null)
      for (const metric of data.report.sceneMetrics) {
        const id: string | undefined = data.report.sceneIds?.[metric.scene - 1]
        const position = id ? index.get(id) : metric.scene - 1
        if (position !== undefined && position < scenes.length) tension[position] = metric
      }
    }

    const cast = data.entities ? castPresence(data.entities, data.texts) : []
    const facts = data.entities ? factsPerScene(data.entities, scenes) : null

    return {
      metrics,
      words,
      totalWords,
      dialogueShare: totalWords ? dialogueWords / totalWords : 0,
      avgSentence: sentenceCount ? totalWords / sentenceCount : 0,
      medianWords: median(words),
      tension,
      cast,
      facts: facts && facts.some(Boolean) ? facts : null,
      openings: similarOpenings(metrics.map((metric) => metric.opening)),
    }
  }, [data, scenes])

  const runs = groupRuns(scenes)
  const groupById = new Map(groups.map((group) => [group.id, group]))
  const bands: StripBand[] = runs
    .filter((run) => groupById.has(run.groupId))
    .map((run) => {
      const group = groupById.get(run.groupId)!
      return {
        key: group.id,
        start: run.start,
        length: run.length,
        label: group.name,
        colorClass: `group-${group.color}`,
        title: group.name,
      }
    })

  if (!projectKey) {
    return (
      <section className="panel rhythm-empty">
        <strong>Desbloqueie o projeto</strong>
        <p>As medidas de ritmo são calculadas a partir do texto, que só é lido neste navegador.</p>
      </section>
    )
  }

  const focus = hovered ?? selected
  const castRows = (analysis?.cast ?? [])
    .filter((row) => castFilter === 'ALL' || row.type === castFilter)
    .slice(0, 8)

  function select(index: number) {
    setSelected(index)
    document.querySelector('.rhythm-chart-panel')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }

  const sceneButton = (index: number, label?: ReactNode) => (
    <button className="scene-ref" type="button" onClick={() => select(index)}>
      {label ?? `cena ${index + 1}`}
    </button>
  )
  const runButton = (run: { start: number; length: number }) => (
    <button className="scene-ref" type="button" onClick={() => select(run.start)}>
      {rangeLabel(run.start, run.length)}
    </button>
  )

  // Descriptive readings: where things happen, never what to change.
  const readings: ReactNode[] = []
  if (analysis && scenes.length > 1) {
    const { metrics, words, medianWords, tension, cast } = analysis
    const longest = words.indexOf(Math.max(...words))
    const shortest = words.indexOf(Math.min(...words.filter((value) => value > 0)))
    readings.push(
      <>
        Cena mais longa: {sceneButton(longest)} ({number(words[longest])} palavras); mais curta: {sceneButton(shortest)} (
        {number(words[shortest])}). Mediana: {number(Math.round(medianWords))} palavras.
      </>,
    )
    const longRun = longestRun(words.length, (index) => words[index] > medianWords * 1.5)
    if (longRun && longRun.length >= 2) {
      readings.push(<>Maior sequência de cenas longas (acima de 1,5× a mediana): {runButton(longRun)}.</>)
    }
    const quietRun = longestRun(metrics.length, (index) => metrics[index].dialogueShare < 0.1)
    if (quietRun && quietRun.length >= 3) {
      readings.push(<>Trecho mais longo quase sem diálogo (menos de 10%): {runButton(quietRun)}.</>)
    }
    if (tension) {
      const scored = tension.map((metric, index) => ({ metric, index })).filter((item) => item.metric)
      const peak = scored.reduce((best, item) => (item.metric!.tension > best.metric!.tension ? item : best), scored[0])
      if (peak) {
        readings.push(
          <>
            Tensão máxima: {sceneButton(peak.index)} ({peak.metric!.tension}/10), a {percent((peak.index + 0.5) / scenes.length)} da
            obra.
          </>,
        )
      }
      const plateau = longestRun(tension.length, (index) => (tension[index]?.tension ?? 10) <= 3)
      if (plateau && plateau.length >= 3) {
        readings.push(<>Maior trecho de tensão baixa (até 3): {runButton(plateau)}.</>)
      }
      const peaks = tension.filter((metric) => metric?.beat === 'PEAK').length
      readings.push(<>{peaks === 1 ? '1 cena marcada como pico' : `${peaks} cenas marcadas como pico`} pelo Arquiteto.</>)
    }
    const lead = cast.find((row) => row.type === 'CHARACTER') ?? cast[0]
    if (lead) {
      readings.push(
        <>
          Mais presente: <strong>{lead.name}</strong>, em {lead.scenes} de {scenes.length} cenas.
        </>,
      )
    }
    // The longest absence of a main character between appearances.
    const absences = cast
      .filter((row) => row.type === 'CHARACTER')
      .slice(0, 6)
      .map((row) => {
        const first = row.mentions.findIndex(Boolean)
        const last = row.mentions.length - 1 - [...row.mentions].reverse().findIndex(Boolean)
        const gap = longestRun(row.mentions.length, (index) => index > first && index < last && row.mentions[index] === 0)
        return { row, gap }
      })
      .filter((item) => item.gap && item.gap.length >= 5)
      .sort((a, b) => b.gap!.length - a.gap!.length)[0]
    if (absences) {
      readings.push(
        <>
          Maior ausência de um personagem principal: <strong>{absences.row.name}</strong> não aparece nas {runButton(absences.gap!)}
          , e volta depois.
        </>,
      )
    }
    if (analysis.facts) {
      const covered = analysis.facts.filter(Boolean).length
      readings.push(
        <>
          Mudanças de estado registradas em {covered} de {scenes.length} cenas (só cenas analisadas com fatos aprovados).
        </>,
      )
    }
  }

  const shares = analysis ? groupShares(groups, runs, analysis.words) : null
  const openingDialogue = analysis ? analysis.metrics.filter((metric) => metric.openingKind === 'dialogue').length : 0
  const endingCounts = analysis
    ? (['dialogue', 'question', 'narration'] as const).map(
        (kind) => analysis.metrics.filter((metric) => metric.endingKind === kind).length,
      )
    : [0, 0, 0]

  const inspected = focus !== null && analysis ? focus : null
  const inspectedSlot = inspected !== null ? scenes[inspected] : null
  const inspectedMetrics = inspected !== null ? analysis!.metrics[inspected] : null
  const inspectedTension = inspected !== null ? analysis!.tension?.[inspected] ?? null : null
  const inspectedGroup = inspectedSlot?.groupId ? groupById.get(inspectedSlot.groupId) : undefined

  return (
    <section className="rhythm-page">
      <header className="rhythm-header">
        <div className="page-intro">
          <p className="eyebrow">Diagnóstico do manuscrito</p>
          <h1>Ritmo e tensão</h1>
          <p>
            Como a obra se move, cena a cena. Extensão, diálogo, frases e elenco são medidos neste navegador, a partir
            do texto; a curva de tensão vem da revisão arquitetural.
          </p>
        </div>
        {data && (
          <button className="button button-secondary" type="button" onClick={() => setReloads((count) => count + 1)}>
            Atualizar medidas
          </button>
        )}
      </header>

      {scenes.length === 0 && (
        <section className="panel rhythm-empty">
          <strong>Nenhuma cena na timeline</strong>
          <p>As medidas aparecem quando houver cenas na linha do tempo.</p>
        </section>
      )}

      {error && <p className="form-message">{error}</p>}

      {!data && scenes.length > 0 && !error && (
        <section className="panel rhythm-loading" role="status">
          <span className="architect-spinner" aria-hidden="true" />
          {progress ? `Lendo cenas: ${progress.done} de ${progress.total}…` : 'Lendo cenas…'}
          {progress && (
            <span className="rhythm-progress">
              <span style={{ width: `${(progress.done / progress.total) * 100}%` }} />
            </span>
          )}
        </section>
      )}

      {analysis && (
        <>
          <dl className="rhythm-stats">
            <div>
              <dt>Palavras</dt>
              <dd>{number(analysis.totalWords)}</dd>
              <span>{scenes.length} cenas · mediana {number(Math.round(analysis.medianWords))}</span>
            </div>
            <div>
              <dt>Diálogo</dt>
              <dd>{percent(analysis.dialogueShare)}</dd>
              <span>do texto da obra</span>
            </div>
            <div>
              <dt>Frases</dt>
              <dd>{analysis.avgSentence.toFixed(1)}</dd>
              <span>palavras por frase, em média</span>
            </div>
            <div>
              <dt>Tensão</dt>
              {analysis.tension ? (
                <>
                  <dd>
                    {(() => {
                      const scored = analysis.tension.filter((metric): metric is SceneMetric => metric !== null)
                      return (scored.reduce((sum, metric) => sum + metric.tension, 0) / (scored.length || 1)).toFixed(1)
                    })()}
                    <small>/10</small>
                  </dd>
                  <span>média · relatório de {dateFormat.format(new Date(data!.report!.createdAt))}</span>
                </>
              ) : (
                <>
                  <dd className="rhythm-stat-missing">—</dd>
                  <button className="text-button" type="button" onClick={onOpenArchitect}>
                    Gerar na revisão arquitetural
                  </button>
                </>
              )}
            </div>
          </dl>

          <section className="panel rhythm-chart-panel" aria-labelledby="rhythm-chart-title">
            <div className="rhythm-panel-heading">
              <h2 id="rhythm-chart-title">Linha da obra</h2>
              <p>Passe o mouse ou use as setas para ver cada cena. Clique para fixar.</p>
              {analysis.cast.length > 0 && (
                <label className="rhythm-cast-filter">
                  <span>Elenco</span>
                  <select value={castFilter} onChange={(event) => setCastFilter(event.target.value as CastFilter)}>
                    {Object.entries(castFilters).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
            {!analysis.tension && (
              <p className="rhythm-hint">
                Sem curva de tensão ainda: ela é gerada junto com a{' '}
                <button className="text-button" type="button" onClick={onOpenArchitect}>
                  revisão arquitetural
                </button>
                .
              </p>
            )}
            <div className="rhythm-scroll">
              <RhythmChart
                bands={bands}
                cast={castRows}
                facts={analysis.facts}
                metrics={analysis.metrics}
                scenes={scenes}
                selected={selected}
                tension={analysis.tension}
                onHover={setHovered}
                onSelect={setSelected}
              />
            </div>
            {analysis.tension && (
              <ul className="rhythm-legend" aria-label="Funções na curva">
                {Object.entries(beatLabels).map(([beat, label]) => (
                  <li key={beat}>
                    <span className={`beat-dot beat-${beat.toLowerCase()}`} aria-hidden="true" />
                    {label}
                  </li>
                ))}
              </ul>
            )}

            <div className="rhythm-inspector" aria-live="polite">
              {inspectedSlot && inspectedMetrics ? (
                <>
                  <div className="rhythm-inspector-heading">
                    <span className="rhythm-scene-number">{inspected! + 1}</span>
                    <div>
                      <h3>{sceneTitle(inspectedSlot)}</h3>
                      {inspectedGroup && (
                        <span className={`rhythm-group group-${inspectedGroup.color}`}>{inspectedGroup.name}</span>
                      )}
                    </div>
                    <button className="button button-secondary button-small" type="button" onClick={() => onOpenScene(inspectedSlot)}>
                      Abrir cena
                    </button>
                  </div>
                  <div className="rhythm-inspector-body">
                    {analysis.tension && (
                      <div className="rhythm-inspector-tension">
                        {inspectedTension ? (
                          <>
                            <p className="rhythm-tension-score">
                              <strong>{inspectedTension.tension}</strong>/10
                              <span className={`beat-chip beat-${inspectedTension.beat.toLowerCase()}`}>
                                {beatLabels[inspectedTension.beat]}
                              </span>
                            </p>
                            <blockquote>{inspectedTension.evidence}</blockquote>
                            <dl className="rhythm-components">
                              {(
                                [
                                  ['O que está em jogo', inspectedTension.stakes],
                                  ['Oposição', inspectedTension.opposition],
                                  ['Incerteza', inspectedTension.uncertainty],
                                ] as const
                              ).map(([label, value]) => (
                                <div key={label}>
                                  <dt>{label}</dt>
                                  <dd>
                                    <span className="rhythm-meter">
                                      <span style={{ width: `${value * 10}%` }} />
                                    </span>
                                    {value}
                                  </dd>
                                </div>
                              ))}
                            </dl>
                          </>
                        ) : (
                          <p className="rhythm-muted">Sem nota de tensão: a cena é posterior ao relatório.</p>
                        )}
                      </div>
                    )}
                    <dl className="rhythm-scene-stats">
                      <div>
                        <dt>Palavras</dt>
                        <dd>{number(inspectedMetrics.words)}</dd>
                      </div>
                      <div>
                        <dt>Diálogo</dt>
                        <dd>{percent(inspectedMetrics.dialogueShare)}</dd>
                      </div>
                      <div>
                        <dt>Palavras/frase</dt>
                        <dd>
                          {inspectedMetrics.avgSentenceWords.toFixed(1)}
                          <small> ±{inspectedMetrics.sentenceSpread.toFixed(0)}</small>
                        </dd>
                      </div>
                      <div>
                        <dt>Parágrafos</dt>
                        <dd>{inspectedMetrics.paragraphs}</dd>
                      </div>
                      <div>
                        <dt>Perguntas</dt>
                        <dd>
                          {inspectedMetrics.questionsPer1k.toFixed(1)}
                          <small> /mil palavras</small>
                        </dd>
                      </div>
                      {analysis.facts && (
                        <div>
                          <dt>Fatos</dt>
                          <dd>{analysis.facts[inspected!]}</dd>
                        </div>
                      )}
                    </dl>
                    <div className="rhythm-inspector-text">
                      {analysis.cast.some((row) => row.mentions[inspected!]) && (
                        <p>
                          <span className="rhythm-muted">Em cena: </span>
                          {analysis.cast
                            .filter((row) => row.mentions[inspected!])
                            .sort((a, b) => b.mentions[inspected!] - a.mentions[inspected!])
                            .slice(0, 6)
                            .map((row) => `${row.name} (${row.mentions[inspected!]})`)
                            .join(', ')}
                        </p>
                      )}
                      {inspectedMetrics.opening && (
                        <p>
                          <span className="rhythm-muted">Abre com: </span>
                          <q>{inspectedMetrics.opening}</q>
                        </p>
                      )}
                      {inspectedMetrics.ending && inspectedMetrics.ending !== inspectedMetrics.opening && (
                        <p>
                          <span className="rhythm-muted">Termina com: </span>
                          <q>{inspectedMetrics.ending}</q>
                        </p>
                      )}
                    </div>
                  </div>
                </>
              ) : (
                <p className="rhythm-muted">Escolha uma cena na linha da obra para ver os detalhes.</p>
              )}
            </div>
          </section>

          <div className="rhythm-columns">
            <section className="panel rhythm-cadence" aria-labelledby="rhythm-structure-title">
              <h2 id="rhythm-structure-title">Proporções da estrutura</h2>
              {shares && shares.rows.length > 0 ? (
                <>
                  <p className="rhythm-panel-note">
                    Parte da obra, em palavras, ocupada por cada grupo da timeline.
                    {shares.template && ` A marca mostra a proporção usual em “${shares.template}” (aproximada).`}
                  </p>
                  <ol className="rhythm-shares">
                    {shares.rows.map((row) => (
                      <li className={`group-${row.group.color}`} key={row.group.id}>
                        <span className="rhythm-share-name">{row.group.name}</span>
                        <span className="rhythm-share-bar">
                          <span style={{ width: `${row.share * 100}%` }} />
                          {row.expected !== null && (
                            <span
                              className="rhythm-share-expected"
                              style={{ left: `${row.expected * 100}%` }}
                              title={`Usual: ${percent(row.expected)}`}
                            />
                          )}
                        </span>
                        <span className="rhythm-share-value">
                          {percent(row.share)}
                          {row.expected !== null && <small> · usual {percent(row.expected)}</small>}
                        </span>
                      </li>
                    ))}
                  </ol>
                </>
              ) : (
                <p className="rhythm-panel-note">
                  Agrupe as cenas em atos ou etapas (botão “Estrutura” na linha do tempo) para ver quanto da obra cada parte
                  ocupa.
                </p>
              )}

              <h3>Aberturas e finais</h3>
              <div className="rhythm-split">
                <span>Cenas que abrem com diálogo</span>
                <strong>
                  {openingDialogue} de {scenes.length}
                </strong>
              </div>
              <div className="rhythm-endings" aria-label="Como as cenas terminam">
                {(['Em diálogo', 'Em pergunta', 'Em narração'] as const).map((label, index) => (
                  <span
                    className={`rhythm-ending rhythm-ending-${index}`}
                    key={label}
                    style={{ flexGrow: endingCounts[index] || 0.0001 }}
                    title={`${label}: ${endingCounts[index]}`}
                  >
                    {endingCounts[index] > 0 && `${label.replace('Em ', '')} ${endingCounts[index]}`}
                  </span>
                ))}
              </div>
              {analysis.openings.length > 0 && (
                <>
                  <p className="rhythm-panel-note">Aberturas parecidas (mesmas palavras no início):</p>
                  <ul className="rhythm-openings">
                    {analysis.openings.slice(0, 4).map((cluster) => (
                      <li key={cluster.scenes.join('-')}>
                        <q>{analysis.metrics[cluster.seed].opening}</q>
                        {cluster.words.length > 0 && (
                          <span className="rhythm-muted">Em comum: {cluster.words.join(', ')}</span>
                        )}
                        <span>
                          {cluster.scenes.slice(0, 10).map((index, position) => (
                            <span key={index}>
                              {position > 0 && ', '}
                              {sceneButton(index)}
                            </span>
                          ))}
                          {cluster.scenes.length > 10 && ` e mais ${cluster.scenes.length - 10}`}
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </section>

            <section className="panel rhythm-readings" aria-labelledby="rhythm-readings-title">
              <h2 id="rhythm-readings-title">Leituras</h2>
              <p className="rhythm-panel-note">Onde as coisas acontecem na obra. São medidas; não indicam o que mudar.</p>
              <ul>
                {readings.map((reading, index) => (
                  <li key={index}>{reading}</li>
                ))}
              </ul>
            </section>
          </div>
        </>
      )}
    </section>
  )
}
