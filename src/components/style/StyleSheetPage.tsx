import { useEffect, useMemo, useState } from 'react'
import type { Slot } from '../../api/contracts'
import { loadSceneTexts } from '../../features/manuscript/loadSceneTexts'
import { orderScenes, sceneTitle } from '../../features/scenes/sceneStatus'
import {
  checkScene,
  conventionGroupLabels,
  newRule,
  noConventions,
  ruleKindLabels,
  ruleLabel,
  typographyLabels,
  typographyRuleId,
  type StyleRule,
  type StyleRuleKind,
  type ConventionGroup,
  type StyleSheet,
  type TypographyConventions,
} from '../../features/style/styleSheet'
import './StyleSheetPage.css'

interface StyleSheetPageProps {
  projectKey: CryptoKey | null
  slots: Slot[]
  sheet: StyleSheet | null
  isLoading: boolean
  error: string | null
  names: string[]
  onSave: (sheet: StyleSheet) => Promise<void>
  onOpenScene: (slot: Slot) => void
  // Opens the copyedit dialog: fixes across the book, reviewed one by one.
  onCopyedit?: () => void
}

const kindHelp: Record<StyleRuleKind, string> = {
  PREFER: 'Uma grafia do projeto: aponta as variantes e mostra a forma preferida.',
  AVOID: 'Palavras ou expressões que o projeto não usa.',
  LIMIT: 'Palavras que podem aparecer, mas só até um número de vezes por cena.',
}

const defaultCategories = ['Grafia', 'Nomes', 'Vocabulário', 'Muletas', 'Pontuação']

// Optional starting points; they become ordinary rules of this project.
const starters: Array<{ name: string; description: string; rules: Array<Partial<StyleRule>> }> = [
  {
    name: 'Muletas comuns',
    description: 'Limita “de repente”, “então”, “realmente”, “muito”, “apenas” a 2 por cena.',
    rules: [
      { kind: 'LIMIT', terms: ['de repente', 'repentinamente', 'subitamente'], maxPerScene: 1, category: 'Muletas' },
      { kind: 'LIMIT', terms: ['então'], maxPerScene: 2, category: 'Muletas' },
      { kind: 'LIMIT', terms: ['realmente', 'muito', 'apenas', 'simplesmente'], maxPerScene: 2, category: 'Muletas' },
    ],
  },
  {
    name: 'Verbos de filtro',
    description: 'Limita “viu”, “ouviu”, “sentiu”, “percebeu”, “notou”: distanciam o leitor da cena.',
    rules: [
      {
        kind: 'LIMIT',
        terms: ['viu', 'ouviu', 'sentiu', 'percebeu', 'notou', 'reparou'],
        maxPerScene: 3,
        category: 'Vocabulário',
        note: 'Verbos de percepção põem um filtro entre o leitor e a cena.',
      },
    ],
  },
]

const splitTerms = (value: string) =>
  value
    .split(/[\n,;]/)
    .map((term) => term.trim())
    .filter(Boolean)

export function StyleSheetPage({
  projectKey,
  slots,
  sheet,
  isLoading,
  error,
  names,
  onSave,
  onOpenScene,
  onCopyedit,
}: StyleSheetPageProps) {
  const scenes = useMemo(() => orderScenes(slots), [slots])
  const sceneKey = scenes.map((slot) => slot.id).join(',')
  const [texts, setTexts] = useState<{ key: string; texts: string[] } | null>(null)
  const [scanProgress, setScanProgress] = useState<{ done: number; total: number } | null>(null)
  const [draft, setDraft] = useState<StyleRule | null>(null)
  const [termsInput, setTermsInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  // The whole book, decrypted here, so rules can be checked everywhere.
  useEffect(() => {
    if (!projectKey || scenes.length === 0) return
    let isCurrent = true
    loadSceneTexts(projectKey, scenes, (done, total) => {
      if (isCurrent) setScanProgress({ done, total })
    })
      .then((loaded) => {
        if (isCurrent) setTexts({ key: sceneKey, texts: loaded })
      })
      .catch(() => {
        // The rules stay editable; only the counts are missing.
      })
      .finally(() => {
        if (isCurrent) setScanProgress(null)
      })
    return () => {
      isCurrent = false
    }
    // The scene list is captured by its key; titles changing don't reload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectKey, sceneKey])

  const bookTexts = texts?.key === sceneKey ? texts.texts : null

  const scan = useMemo(() => {
    if (!sheet || !bookTexts) return null
    const perScene = scenes.map((slot, index) => checkScene(bookTexts[index], sheet, { slotId: slot.id, names }))
    const byRule = new Map<string, { occurrences: number; scenes: number }>()
    perScene.forEach((findings) => {
      const seen = new Set<string>()
      for (const finding of findings) {
        if (finding.isException) continue
        const entry = byRule.get(finding.ruleId) ?? { occurrences: 0, scenes: 0 }
        entry.occurrences += 1
        if (!seen.has(finding.ruleId)) entry.scenes += 1
        seen.add(finding.ruleId)
        byRule.set(finding.ruleId, entry)
      }
    })
    const counts = perScene.map((findings) => findings.filter((finding) => !finding.isException).length)
    return { byRule, counts, total: counts.reduce((a, b) => a + b, 0) }
  }, [sheet, bookTexts, scenes, names])

  // What the rule being edited would catch, before it's saved.
  const preview = useMemo(() => {
    if (!draft || !bookTexts) return null
    const rule = { ...draft, terms: splitTerms(termsInput) }
    const probe: StyleSheet = {
      version: 1,
      rules: [rule],
      typography: noConventions(),
      exceptions: [],
    }
    let occurrences = 0
    let inScenes = 0
    const samples: string[] = []
    scenes.forEach((slot, index) => {
      const found = checkScene(bookTexts[index], probe, { slotId: slot.id })
      if (found.length) inScenes += 1
      occurrences += found.length
      for (const finding of found) if (samples.length < 3 && !samples.includes(finding.match)) samples.push(finding.match)
    })
    return { occurrences, inScenes, samples }
  }, [draft, termsInput, bookTexts, scenes])

  async function persist(next: StyleSheet) {
    setSaving(true)
    setSaveError(null)
    try {
      await onSave(next)
      return true
    } catch (reason) {
      setSaveError(reason instanceof Error ? reason.message : 'Não foi possível salvar a folha de estilo.')
      return false
    } finally {
      setSaving(false)
    }
  }

  if (!projectKey) {
    return (
      <section className="panel style-page-empty">
        <strong>Desbloqueie o projeto</strong>
        <p>A folha de estilo é cifrada com a senha do projeto.</p>
      </section>
    )
  }
  if (isLoading || !sheet) {
    return <p className="style-page-loading">{error ?? 'Abrindo a folha de estilo…'}</p>
  }

  const categories = [...new Set([...defaultCategories, ...sheet.rules.map((rule) => rule.category).filter(Boolean)])]
  const grouped = new Map<string, StyleRule[]>()
  for (const rule of sheet.rules) {
    const category = rule.category || ruleKindLabels[rule.kind]
    grouped.set(category, [...(grouped.get(category) ?? []), rule])
  }

  function startRule(rule: StyleRule) {
    setDraft(rule)
    setTermsInput(rule.terms.join(', '))
  }

  async function saveDraft() {
    if (!draft || !sheet) return
    const rule = { ...draft, terms: splitTerms(termsInput) }
    const exists = sheet.rules.some((item) => item.id === rule.id)
    const ok = await persist({
      ...sheet,
      rules: exists ? sheet.rules.map((item) => (item.id === rule.id ? rule : item)) : [...sheet.rules, rule],
    })
    if (ok) setDraft(null)
  }

  const draftIsValid =
    draft !== null &&
    splitTerms(termsInput).length > 0 &&
    (draft.kind !== 'PREFER' || draft.preferred.trim().length > 0) &&
    (draft.kind !== 'LIMIT' || draft.maxPerScene >= 0)

  const ruleCount = (ruleId: string) => {
    const entry = scan?.byRule.get(ruleId)
    if (!scan) return scanProgress ? '…' : null
    if (!entry) return 'nenhuma ocorrência'
    return `${entry.occurrences} em ${entry.scenes} ${entry.scenes === 1 ? 'cena' : 'cenas'}`
  }

  const exceptionsByScene = new Map<string, number>()
  for (const exception of sheet.exceptions) {
    exceptionsByScene.set(exception.slotId, (exceptionsByScene.get(exception.slotId) ?? 0) + 1)
  }

  return (
    <section className="style-page">
      <header className="page-intro">
        <p className="eyebrow">Projeto</p>
        <h1>Folha de estilo</h1>
        <p>
          As convenções do projeto (grafias, vocabulário e tipografia), verificadas em todas as cenas. Elas aparecem
          na aba “Estilo” do Revisor, abaixo da análise, e nunca alteram o texto.
        </p>
      </header>

      {(saveError || error) && <p className="form-message">{saveError ?? error}</p>}

      <div className="style-layout">
        <div className="style-main">
          <section className="panel" aria-labelledby="style-rules-title">
            <div className="style-panel-heading">
              <h2 id="style-rules-title">Regras</h2>
              {saving && <span className="style-saving">Salvando…</span>}
              <div className="style-new">
                {(['PREFER', 'AVOID', 'LIMIT'] as const).map((kind) => (
                  <button
                    className="button button-secondary button-small"
                    disabled={draft !== null}
                    key={kind}
                    type="button"
                    onClick={() => startRule(newRule(kind))}
                  >
                    + {ruleKindLabels[kind]}
                  </button>
                ))}
              </div>
            </div>

            {draft && (
              <form
                aria-label="Regra"
                className="style-editor"
                onSubmit={(event) => {
                  event.preventDefault()
                  void saveDraft()
                }}
              >
                <div className="style-kind" role="radiogroup" aria-label="Tipo de regra">
                  {(['PREFER', 'AVOID', 'LIMIT'] as const).map((kind) => (
                    <button
                      aria-checked={draft.kind === kind}
                      key={kind}
                      role="radio"
                      type="button"
                      onClick={() => setDraft({ ...draft, kind })}
                    >
                      {ruleKindLabels[kind]}
                    </button>
                  ))}
                </div>
                <p className="style-help">{kindHelp[draft.kind]}</p>
                <div className="style-fields">
                  {draft.kind === 'PREFER' && (
                    <label>
                      <span>Forma preferida</span>
                      <input
                        autoFocus
                        placeholder="Ex.: e-mail"
                        value={draft.preferred}
                        onChange={(event) => setDraft({ ...draft, preferred: event.target.value })}
                      />
                    </label>
                  )}
                  <label className="style-field-wide">
                    <span>
                      {draft.kind === 'PREFER' ? 'Variantes a apontar' : draft.kind === 'AVOID' ? 'Termos a evitar' : 'Termos'}
                    </span>
                    <input
                      autoFocus={draft.kind !== 'PREFER'}
                      placeholder={draft.kind === 'PREFER' ? 'Ex.: email, E-mail' : 'Separe com vírgulas'}
                      value={termsInput}
                      onChange={(event) => setTermsInput(event.target.value)}
                    />
                  </label>
                  {draft.kind === 'LIMIT' && (
                    <label>
                      <span>Máximo por cena</span>
                      <input
                        min={0}
                        type="number"
                        value={draft.maxPerScene}
                        onChange={(event) => setDraft({ ...draft, maxPerScene: Math.max(0, Number(event.target.value) || 0) })}
                      />
                    </label>
                  )}
                  <label>
                    <span>Categoria</span>
                    <input
                      list="style-categories"
                      placeholder="Ex.: Grafia"
                      value={draft.category}
                      onChange={(event) => setDraft({ ...draft, category: event.target.value })}
                    />
                    <datalist id="style-categories">
                      {categories.map((category) => (
                        <option key={category} value={category} />
                      ))}
                    </datalist>
                  </label>
                  <label className="style-field-wide">
                    <span>Observação para quem revisa (opcional)</span>
                    <input
                      placeholder="Ex.: grafia adotada pela editora"
                      value={draft.note}
                      onChange={(event) => setDraft({ ...draft, note: event.target.value })}
                    />
                  </label>
                </div>
                <div className="style-options">
                  <label className="checkbox-label">
                    <input
                      checked={draft.wholeWord}
                      type="checkbox"
                      onChange={(event) => setDraft({ ...draft, wholeWord: event.target.checked })}
                    />
                    <span>Palavra inteira</span>
                  </label>
                  <label className="checkbox-label">
                    <input
                      checked={draft.matchCase}
                      type="checkbox"
                      onChange={(event) => setDraft({ ...draft, matchCase: event.target.checked })}
                    />
                    <span>Diferenciar maiúsculas</span>
                  </label>
                  <label className="checkbox-label">
                    <input
                      checked={draft.ignoreAccents}
                      type="checkbox"
                      onChange={(event) => setDraft({ ...draft, ignoreAccents: event.target.checked })}
                    />
                    <span>Ignorar acentos</span>
                  </label>
                </div>
                <p className="style-preview" role="status">
                  {!bookTexts
                    ? 'Lendo a obra para mostrar o alcance da regra…'
                    : !preview || splitTerms(termsInput).length === 0
                      ? 'Escreva os termos para ver quantas vezes aparecem na obra.'
                      : preview.occurrences === 0
                        ? 'Nenhuma ocorrência na obra hoje.'
                        : `Apontaria ${preview.occurrences} ${preview.occurrences === 1 ? 'ocorrência' : 'ocorrências'} em ${preview.inScenes} ${preview.inScenes === 1 ? 'cena' : 'cenas'}${preview.samples.length ? `: ${preview.samples.map((sample) => `“${sample}”`).join(', ')}` : ''}.`}
                </p>
                <div className="style-editor-actions">
                  <button className="button button-secondary" type="button" onClick={() => setDraft(null)}>
                    Cancelar
                  </button>
                  <button className="button button-primary" disabled={!draftIsValid || saving} type="submit">
                    {sheet.rules.some((rule) => rule.id === draft.id) ? 'Salvar regra' : 'Adicionar regra'}
                  </button>
                </div>
              </form>
            )}

            {sheet.rules.length === 0 && !draft ? (
              <div className="style-starters">
                <p>Nenhuma regra ainda. Crie a sua ou comece por um destes pontos de partida:</p>
                <ul>
                  {starters.map((starter) => (
                    <li key={starter.name}>
                      <button
                        disabled={saving}
                        type="button"
                        onClick={() =>
                          void persist({
                            ...sheet,
                            rules: [...sheet.rules, ...starter.rules.map((rule) => ({ ...newRule(rule.kind ?? 'LIMIT'), ...rule }))],
                          })
                        }
                      >
                        <strong>{starter.name}</strong>
                        <span>{starter.description}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              [...grouped].map(([category, rules]) => (
                <div className="style-rule-group" key={category}>
                  <h3>{category}</h3>
                  <ul>
                    {rules.map((rule) => (
                      <li className={`style-rule${rule.enabled ? '' : ' is-disabled'}`} key={rule.id}>
                        <span className={`style-kind-chip kind-${rule.kind.toLowerCase()}`}>{ruleKindLabels[rule.kind]}</span>
                        <div className="style-rule-main">
                          <strong>{ruleLabel(rule)}</strong>
                          <span>
                            {[
                              rule.wholeWord ? 'palavra inteira' : 'parte de palavra',
                              rule.matchCase ? 'diferencia maiúsculas' : null,
                              rule.ignoreAccents ? 'ignora acentos' : null,
                              ruleCount(rule.id),
                            ]
                              .filter(Boolean)
                              .join(' · ')}
                          </span>
                          {rule.note && <em>{rule.note}</em>}
                        </div>
                        <div className="style-rule-actions">
                          <label className="checkbox-label" title={rule.enabled ? 'Desativar regra' : 'Ativar regra'}>
                            <input
                              checked={rule.enabled}
                              disabled={saving}
                              type="checkbox"
                              onChange={(event) =>
                                void persist({
                                  ...sheet,
                                  rules: sheet.rules.map((item) =>
                                    item.id === rule.id ? { ...item, enabled: event.target.checked } : item,
                                  ),
                                })
                              }
                            />
                            <span>Ativa</span>
                          </label>
                          <button className="text-button" disabled={draft !== null} type="button" onClick={() => startRule(rule)}>
                            Editar
                          </button>
                          <button
                            className="text-button destructive"
                            disabled={saving}
                            type="button"
                            onClick={() => {
                              if (window.confirm(`Excluir a regra “${ruleLabel(rule)}”?`)) {
                                void persist({
                                  ...sheet,
                                  rules: sheet.rules.filter((item) => item.id !== rule.id),
                                  exceptions: sheet.exceptions.filter((exception) => exception.ruleId !== rule.id),
                                })
                              }
                            }}
                          >
                            Excluir
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              ))
            )}
          </section>

          {(['tipografia', 'portugues'] as ConventionGroup[]).map((group) => (
          <section className="panel" aria-labelledby={`style-${group}-title`} key={group}>
            <h2 id={`style-${group}-title`}>{conventionGroupLabels[group].title}</h2>
            {conventionGroupLabels[group].description && (
              <p className="panel-description">{conventionGroupLabels[group].description}</p>
            )}
            <ul className="style-typography">
              {(Object.keys(typographyLabels) as Array<keyof TypographyConventions>)
                .filter((key) => (typographyLabels[key].group ?? 'tipografia') === group)
                .map((key) => (
                <li key={key}>
                  <label className="checkbox-label">
                    <input
                      checked={sheet.typography[key]}
                      disabled={saving}
                      type="checkbox"
                      onChange={(event) =>
                        void persist({ ...sheet, typography: { ...sheet.typography, [key]: event.target.checked } })
                      }
                    />
                    <span>
                      <strong>{typographyLabels[key].label}</strong>
                      <small>
                        {typographyLabels[key].hint}
                        {sheet.typography[key] && ruleCount(typographyRuleId(key)) ? ` · ${ruleCount(typographyRuleId(key))}` : ''}
                      </small>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </section>
          ))}
        </div>

        <aside className="style-aside">
          <section className="panel" aria-labelledby="style-book-title">
            <h2 id="style-book-title">Na obra</h2>
            {scanProgress ? (
              <p className="style-muted" role="status">
                Lendo cenas: {scanProgress.done} de {scanProgress.total}…
              </p>
            ) : !scan ? (
              <p className="style-muted">{scenes.length === 0 ? 'Nenhuma cena ainda.' : 'Sem leitura da obra.'}</p>
            ) : (
              <>
                <p className="style-total">
                  <strong>{scan.total}</strong> {scan.total === 1 ? 'ocorrência' : 'ocorrências'} em{' '}
                  {scan.counts.filter(Boolean).length} de {scenes.length} cenas
                </p>
                {onCopyedit && scan.total > 0 && (
                  <button className="button button-secondary style-copyedit" type="button" onClick={onCopyedit}>
                    Revisar e corrigir a obra…
                  </button>
                )}
                <ol className="style-scenes">
                  {scenes
                    .map((slot, index) => ({ slot, index, count: scan.counts[index] }))
                    .filter((item) => item.count > 0)
                    .sort((a, b) => b.count - a.count || a.index - b.index)
                    .slice(0, 12)
                    .map(({ slot, count }) => (
                      <li key={slot.id}>
                        <button type="button" onClick={() => onOpenScene(slot)}>
                          <span className="style-scene-number">
                            {slot.isUnanchored || slot.timelinePosition === null ? '—' : slot.timelinePosition + 1}
                          </span>
                          <span className="style-scene-title">{sceneTitle(slot)}</span>
                          <span className="style-scene-count">{count}</span>
                        </button>
                      </li>
                    ))}
                </ol>
              </>
            )}
          </section>

          <section className="panel" aria-labelledby="style-exceptions-title">
            <h2 id="style-exceptions-title">Mantidas</h2>
            {sheet.exceptions.length === 0 ? (
              <p className="style-muted">
                Ocorrências marcadas como intencionais na aba Estilo de uma cena aparecem aqui.
              </p>
            ) : (
              <ul className="style-exceptions">
                {[...exceptionsByScene].map(([slotId, count]) => {
                  const slot = slots.find((item) => item.id === slotId)
                  return (
                    <li key={slotId}>
                      <span>
                        {slot ? sceneTitle(slot) : 'Cena removida'} · {count}
                      </span>
                      <button
                        className="text-button"
                        disabled={saving}
                        type="button"
                        onClick={() =>
                          void persist({
                            ...sheet,
                            exceptions: sheet.exceptions.filter((exception) => exception.slotId !== slotId),
                          })
                        }
                      >
                        Voltar a apontar
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        </aside>
      </div>
    </section>
  )
}

