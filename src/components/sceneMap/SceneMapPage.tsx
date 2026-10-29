import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { api } from '../../api/client'
import type { Slot } from '../../api/contracts'
import {
  functionLabels,
  mapRows,
  narrationLabels,
  outlineText,
  personLabels,
  povReading,
  threadTracks,
  timeLabels,
  type MapRow,
  type StoredSceneCard,
} from '../../features/sceneMap/sceneMap'
import './SceneMapPage.css'

interface SceneMapPageProps {
  projectId: string
  projectTitle: string
  slots: Slot[]
  onOpenScene: (slot: Slot) => void
  // Opens the background analysis dialog; the person picks the scenes there.
  onAnalyse?: () => void
}

type View = 'scenes' | 'pov' | 'threads' | 'time'

const viewLabels: Record<View, string> = {
  scenes: 'Cenas',
  pov: 'Ponto de vista',
  threads: 'Fios da trama',
  time: 'Cronologia',
}

const sceneName = (row: MapRow) => (row.position === null ? 'Avulsa' : `${row.position + 1}`)
const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`

/**
 * The book scene by scene as the Arquivista read it: who narrates, where and
 * when, what each scene does and changes, and the plot threads across it.
 */
export function SceneMapPage({ projectId, projectTitle, slots, onOpenScene, onAnalyse }: SceneMapPageProps) {
  const [cards, setCards] = useState<{ projectId: string; cards: StoredSceneCard[] } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [view, setView] = useState<View>('scenes')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let isCurrent = true
    api
      .listSceneCards(projectId)
      .then((list) => {
        if (isCurrent) {
          setCards({ projectId, cards: list })
          setError(null)
        }
      })
      .catch((reason) => {
        if (isCurrent) setError(reason instanceof Error ? reason.message : 'Não foi possível carregar o mapa de cenas.')
      })
    return () => {
      isCurrent = false
    }
  }, [projectId])

  const loaded = cards?.projectId === projectId ? cards.cards : null
  const rows = useMemo(() => (loaded ? mapRows(slots, loaded) : []), [slots, loaded])
  const pov = useMemo(() => povReading(rows), [rows])
  const threads = useMemo(() => threadTracks(rows), [rows])
  const withCards = rows.filter((row) => row.card).length
  const openThreads = threads.filter((track) => !track.resolved).length

  const sceneButton = (row: MapRow) => (
    <button className="scene-map-ref" type="button" onClick={() => onOpenScene(row.slot)}>
      {row.position === null ? 'avulsa' : `cena ${row.position + 1}`}
    </button>
  )

  return (
    <section className="scene-map-page">
      <header className="scene-map-header">
        <div className="page-intro">
          <p className="eyebrow">{projectTitle}</p>
          <h1>Mapa de cenas</h1>
          <p>
            O livro cena a cena, como o Arquivista leu: quem narra, onde e quando, o que cada cena faz e muda, e os fios
            da trama. As leituras são feitas junto com a análise de cada cena.
          </p>
        </div>
        {loaded && withCards > 0 && (
          <button
            className="button button-secondary"
            type="button"
            onClick={() =>
              void navigator.clipboard.writeText(outlineText(rows)).then(() => {
                setCopied(true)
                window.setTimeout(() => setCopied(false), 2000)
              })
            }
          >
            {copied ? 'Copiado' : 'Copiar como texto'}
          </button>
        )}
      </header>

      {error && (
        <p className="scene-map-error" role="alert">
          {error}
        </p>
      )}

      {loaded && (
        <>
          <ul className="scene-map-tiles">
            <li className="scene-map-tile">
              <span>Cenas lidas</span>
              <strong>
                {withCards} de {rows.length}
              </strong>
              {withCards < rows.length && (
                <small>
                  reanalise as demais para completar o mapa
                  {onAnalyse && (
                    <>
                      {' · '}
                      <button className="inline-link" type="button" onClick={onAnalyse}>
                        Analisar cenas…
                      </button>
                    </>
                  )}
                </small>
              )}
            </li>
            <li className="scene-map-tile">
              <span>Narradores</span>
              <strong>{pov.narrators.length || '—'}</strong>
              {pov.mixed.length > 0 && <small>{plural(pov.mixed.length, 'cena', 'cenas')} com mais de um ponto de vista</small>}
            </li>
            <li className="scene-map-tile">
              <span>Fios da trama</span>
              <strong>{threads.length || '—'}</strong>
              {threads.length > 0 && <small>{plural(openThreads, 'em aberto', 'em aberto')}</small>}
            </li>
          </ul>

          {withCards === 0 ? (
            <section className="panel scene-map-empty">
              <strong>Nenhuma cena com leitura ainda.</strong>
              <p>
                O mapa é preenchido quando as cenas são analisadas. Cenas analisadas antes desta versão precisam de uma
                nova análise para ganhar a leitura (narradores, tempo, funções e fios da trama). A análise usa o seu
                limite mensal de palavras.
              </p>
              {onAnalyse && (
                <button className="button button-primary scene-map-analyse" type="button" onClick={onAnalyse}>
                  Analisar cenas…
                </button>
              )}
            </section>
          ) : (
            <>
              <div className="archive-tabs scene-map-tabs" role="tablist" aria-label="Visões do mapa">
                {(Object.keys(viewLabels) as View[]).map((key) => (
                  <button aria-selected={view === key} className={view === key ? 'is-active' : ''} key={key} role="tab" type="button" onClick={() => setView(key)}>
                    {viewLabels[key]}
                  </button>
                ))}
              </div>

              {view === 'scenes' && (
                <div className="scene-map-table-wrap">
                  <table className="scene-map-table">
                    <thead>
                      <tr>
                        <th scope="col">Cena</th>
                        <th scope="col">Narrador</th>
                        <th scope="col">Lugar e tempo</th>
                        <th scope="col">Função</th>
                        <th scope="col">O que muda</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row) => (
                        <tr className={row.card ? undefined : 'is-unread'} key={row.slot.id}>
                          <th scope="row">
                            <button className="scene-map-scene" type="button" onClick={() => onOpenScene(row.slot)}>
                              <span className="scene-map-number">{sceneName(row)}</span>
                              <span>{row.slot.title?.trim() || 'Cena sem título'}</span>
                            </button>
                            {row.isStale && <span className="scene-map-flag">reanalisada depois desta leitura</span>}
                          </th>
                          {row.card ? (
                            <>
                              <td>
                                {row.card.narrators.map((narrator) => narrator.name).join(', ') || '—'}
                                <small>
                                  {[...new Set(row.card.narrators.map((narrator) => personLabels[narrator.person]))].join(', ')}
                                  {row.card.narration !== 'SINGLE' && ` · ${narrationLabels[row.card.narration]}`}
                                </small>
                              </td>
                              <td>
                                {row.card.place ?? '—'}
                                <small>
                                  {[row.card.time.marker, timeLabels[row.card.time.relation]].filter(Boolean).join(' · ')}
                                </small>
                                {row.card.present.length > 0 && <small>com {row.card.present.join(', ')}</small>}
                              </td>
                              <td>
                                {row.card.function ? (
                                  <span className={`scene-function function-${row.card.function.toLowerCase()}`}>{functionLabels[row.card.function]}</span>
                                ) : (
                                  '—'
                                )}
                              </td>
                              <td>
                                {row.card.change ?? '—'}
                                {row.card.threads.length > 0 && (
                                  <small>
                                    {row.card.threads
                                      .map((thread) => `${thread.action === 'OPENED' ? 'abre' : thread.action === 'RESOLVED' ? 'fecha' : 'avança'}: ${thread.name}`)
                                      .join(' · ')}
                                  </small>
                                )}
                              </td>
                            </>
                          ) : (
                            <td className="scene-map-missing" colSpan={4}>
                              Sem leitura: analise a cena para preencher.
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {view === 'pov' && (
                <div className="scene-map-grid">
                  <section className="panel">
                    <h2>Quem narra</h2>
                    <p className="panel-description">
                      {pov.book === 'ONE'
                        ? 'Um único narrador em todas as cenas lidas.'
                        : pov.book === 'ROTATING'
                          ? 'Narradores que se revezam de cena em cena.'
                          : pov.book === 'MIXED'
                            ? 'Na maior parte das cenas, mais de um ponto de vista ao mesmo tempo.'
                            : 'Nenhum narrador identificado.'}
                    </p>
                    <ul className="pov-bars">
                      {pov.narrators.map((share) => (
                        <li key={share.name}>
                          <span className="pov-name">{share.name}</span>
                          <span className="pov-bar" aria-hidden="true">
                            <span style={{ width: `${(share.scenes / Math.max(1, withCards)) * 100}%` }} />
                          </span>
                          <span className="pov-count">
                            {plural(share.scenes, 'cena', 'cenas')} · {share.persons.map((person) => personLabels[person]).join(', ')}
                          </span>
                        </li>
                      ))}
                    </ul>
                    <ol className="pov-strip" aria-label="Narrador por cena">
                      {rows
                        .filter((row) => row.position !== null)
                        .map((row) => {
                          const index = row.card?.narrators.length
                            ? pov.narrators.findIndex((share) => share.name === row.card!.narrators[0].name)
                            : -1
                          return (
                            <li
                              className={`pov-cell${row.card ? '' : ' is-unread'}${(row.card?.narrators.length ?? 0) > 1 ? ' is-mixed' : ''}`}
                              key={row.slot.id}
                              style={{ '--pov-hue': index >= 0 ? (index * 67) % 360 : 0 } as CSSProperties}
                              title={`Cena ${sceneName(row)}: ${row.card?.narrators.map((narrator) => narrator.name).join(', ') || 'sem leitura'}`}
                            >
                              <button aria-label={`Cena ${sceneName(row)}`} type="button" onClick={() => onOpenScene(row.slot)} />
                            </li>
                          )
                        })}
                    </ol>
                  </section>
                  <section className="panel">
                    <h2>Para conferir</h2>
                    {pov.mixed.length === 0 && pov.personShifts.length === 0 ? (
                      <p className="panel-description">Nenhuma troca de ponto de vista dentro das cenas lidas.</p>
                    ) : (
                      <ul className="scene-map-checks">
                        {pov.book !== 'MIXED' &&
                          pov.mixed.map((row) => (
                            <li key={`mixed-${row.slot.id}`}>
                              {sceneButton(row)}: {row.card!.narrators.map((narrator) => narrator.name).join(' e ')} ·{' '}
                              {narrationLabels[row.card!.narration]}
                              <small>
                                Mais de um ponto de vista na mesma cena. Intencional (narradores juntos) ou uma troca a
                                marcar com quebra de cena?
                              </small>
                            </li>
                          ))}
                        {pov.personShifts.map((shift) => (
                          <li key={`person-${shift.row.slot.id}-${shift.name}`}>
                            {sceneButton(shift.row)}: {shift.name} em {personLabels[shift.person]}
                            <small>Nas outras cenas, {shift.name} narra em {personLabels[shift.usual]}.</small>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                </div>
              )}

              {view === 'threads' && (
                <section className="panel">
                  <h2>Fios da trama</h2>
                  <p className="panel-description">
                    Perguntas, promessas e conflitos que o livro abre, por onde passam e onde se resolvem. Em aberto
                    primeiro, os parados há mais tempo no topo.
                  </p>
                  {threads.length === 0 ? (
                    <p className="scene-map-none">Nenhum fio registrado nas cenas lidas.</p>
                  ) : (
                    <ul className="thread-list">
                      {threads.map((track) => (
                        <li className={track.resolved ? 'is-resolved' : undefined} key={track.name}>
                          <div className="thread-head">
                            <strong>{track.name}</strong>
                            <span className={`thread-state${track.resolved ? ' is-closed' : (track.idleFor ?? 0) >= 8 ? ' is-idle' : ''}`}>
                              {track.resolved
                                ? `resolvido na cena ${(track.resolved.position ?? 0) + 1}`
                                : (track.idleFor ?? 0) > 0
                                  ? `em aberto · parado há ${plural(track.idleFor!, 'cena', 'cenas')}`
                                  : 'em aberto'}
                            </span>
                          </div>
                          <ol className="thread-events">
                            {track.events.map((event, index) => (
                              <li className={`event-${event.action.toLowerCase()}`} key={index}>
                                {sceneButton(event.row)}
                                <span className="thread-action">
                                  {event.action === 'OPENED' ? 'abre' : event.action === 'RESOLVED' ? 'fecha' : 'avança'}
                                </span>
                                {event.note && <span>{event.note}</span>}
                              </li>
                            ))}
                          </ol>
                          {!track.opened && <small className="thread-note">Aparece sem uma cena que o abra: talvez venha de antes das cenas lidas.</small>}
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              )}

              {view === 'time' && (
                <section className="panel">
                  <h2>Cronologia</h2>
                  <p className="panel-description">
                    O tempo da história em cada cena, pelas marcas do próprio texto. Voltas no tempo e tempo incerto
                    ficam destacados.
                  </p>
                  <ol className="time-list">
                    {rows
                      .filter((row) => row.card)
                      .map((row) => (
                        <li className={`time-${row.card!.time.relation.toLowerCase()}`} key={row.slot.id}>
                          {sceneButton(row)}
                          <span className="time-relation">{timeLabels[row.card!.time.relation]}</span>
                          <span>
                            {row.card!.time.marker ? `“${row.card!.time.marker}”` : 'sem marca de tempo no texto'}
                            {row.card!.time.elapsed && <small> · {row.card!.time.elapsed}</small>}
                          </span>
                        </li>
                      ))}
                  </ol>
                </section>
              )}
            </>
          )}
        </>
      )}
      {!loaded && !error && <p className="scene-map-none">Carregando o mapa…</p>}
    </section>
  )
}
