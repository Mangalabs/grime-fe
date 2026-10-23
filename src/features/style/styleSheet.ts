/**
 * Editorial style sheet: the project's own spelling, vocabulary and typography
 * rules, checked deterministically in the browser. It complements the Revisor
 * (LLM) diagnostics and never rewrites the text.
 */

export type StyleRuleKind = 'PREFER' | 'AVOID' | 'LIMIT'

export interface StyleRule {
  id: string
  kind: StyleRuleKind
  // Forms to look for. For PREFER, the variants that should be replaced.
  terms: string[]
  // PREFER: the form the project uses.
  preferred: string
  // LIMIT: how many times the terms may appear in one scene.
  maxPerScene: number
  category: string
  // Why the rule exists, shown to whoever reviews.
  note: string
  wholeWord: boolean
  matchCase: boolean
  ignoreAccents: boolean
  enabled: boolean
}

export interface TypographyConventions {
  // Dialogue lines open with an em dash (—), not a hyphen or en dash.
  dialogueDash: boolean
  // “Curly” quotes instead of "straight" ones.
  curlyQuotes: boolean
  // The ellipsis character (…) instead of three dots.
  ellipsisCharacter: boolean
  doubleSpaces: boolean
  spaceBeforePunctuation: boolean
  // The same word twice in a row ("de de").
  repeatedWords: boolean
  // Archive names written with a different capitalisation or accent.
  archiveNames: boolean
}

/** An occurrence the reviewer decided to keep. */
export interface StyleException {
  ruleId: string
  slotId: string
  match: string
  // Text around the occurrence, so the exception follows it, not its offset.
  context: string
}

export interface StyleSheet {
  version: 1
  rules: StyleRule[]
  typography: TypographyConventions
  exceptions: StyleException[]
}

export const emptyStyleSheet = (): StyleSheet => ({
  version: 1,
  rules: [],
  typography: {
    dialogueDash: false,
    curlyQuotes: false,
    ellipsisCharacter: false,
    doubleSpaces: true,
    spaceBeforePunctuation: true,
    repeatedWords: true,
    archiveNames: false,
  },
  exceptions: [],
})

export const ruleKindLabels: Record<StyleRuleKind, string> = {
  PREFER: 'Preferir',
  AVOID: 'Evitar',
  LIMIT: 'Limitar',
}

export const typographyLabels: Record<keyof TypographyConventions, { label: string; hint: string }> = {
  dialogueDash: { label: 'Travessão nos diálogos', hint: 'Falas abrem com “—”, não com hífen ou meia-risca.' },
  curlyQuotes: { label: 'Aspas curvas', hint: '“assim”, não "assim".' },
  ellipsisCharacter: { label: 'Reticências em um caractere', hint: '“…” em vez de três pontos.' },
  doubleSpaces: { label: 'Espaços duplos', hint: 'Dois espaços seguidos entre palavras.' },
  spaceBeforePunctuation: { label: 'Espaço antes da pontuação', hint: 'Como em “palavra ,” ou “fim .”.' },
  repeatedWords: { label: 'Palavra repetida', hint: 'A mesma palavra duas vezes seguidas, como “de de”.' },
  archiveNames: { label: 'Grafia dos nomes do Arquivo', hint: 'Nomes de entidades com maiúsculas ou acentos diferentes.' },
}

export const typographyRuleId = (key: keyof TypographyConventions) => `typography:${key}`

export function newRule(kind: StyleRuleKind): StyleRule {
  return {
    id: crypto.randomUUID(),
    kind,
    terms: [],
    preferred: '',
    maxPerScene: 3,
    category: '',
    note: '',
    wholeWord: true,
    matchCase: false,
    ignoreAccents: false,
    enabled: true,
  }
}

/** Fills in fields missing from sheets saved by older versions. */
export function normalizeStyleSheet(value: Partial<StyleSheet> | null | undefined): StyleSheet {
  const base = emptyStyleSheet()
  return {
    version: 1,
    rules: (value?.rules ?? []).map((rule) => ({ ...newRule(rule.kind ?? 'AVOID'), ...rule })),
    typography: { ...base.typography, ...(value?.typography ?? {}) },
    exceptions: value?.exceptions ?? [],
  }
}

// --- Matching -----------------------------------------------------------

export interface StyleFinding {
  // Unique within a scene: rule and position.
  key: string
  ruleId: string
  label: string
  category: string
  start: number
  end: number
  match: string
  message: string
  preferred: string | null
  note: string
  context: string
  isException: boolean
}

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Removes accents without changing the length of the text, so positions in
 * the folded text are positions in the original.
 */
export function foldAccents(text: string): string {
  let folded = ''
  for (const character of text) {
    const plain = character.normalize('NFD').replace(/\p{Diacritic}/gu, '')
    // Characters that don't fold to one code unit keep their original form.
    folded += plain.length === character.length ? plain : character
  }
  return folded
}

function contextOf(text: string, start: number, end: number) {
  return text.slice(Math.max(0, start - 24), Math.min(text.length, end + 24))
}

function termPattern(rule: Pick<StyleRule, 'wholeWord' | 'matchCase' | 'ignoreAccents'>, terms: string[]) {
  const sources = terms
    .map((term) => term.trim())
    .filter(Boolean)
    .map((term) => escapeRegExp(rule.ignoreAccents ? foldAccents(term) : term))
  if (sources.length === 0) return null
  // Longer terms first, so "de repente" wins over "de".
  sources.sort((a, b) => b.length - a.length)
  const body = `(?:${sources.join('|')})`
  const source = rule.wholeWord ? `(?<![\\p{L}\\p{N}])${body}(?![\\p{L}\\p{N}])` : body
  return new RegExp(source, `gu${rule.matchCase ? '' : 'i'}`)
}

export function ruleLabel(rule: StyleRule): string {
  const terms = rule.terms.filter(Boolean).join(', ')
  if (rule.kind === 'PREFER') return `${rule.preferred || '…'} (não ${terms || '…'})`
  if (rule.kind === 'LIMIT') return `${terms || '…'}: até ${rule.maxPerScene} por cena`
  return terms || '…'
}

export interface CheckContext {
  slotId: string
  // Archive entities, for the name spelling convention.
  names?: string[]
}

/** Every occurrence of the style sheet's rules in one scene's text. */
export function checkScene(text: string, sheet: StyleSheet, context: CheckContext): StyleFinding[] {
  const findings: StyleFinding[] = []
  const folded = foldAccents(text)
  const isException = (ruleId: string, match: string, start: number, end: number) =>
    sheet.exceptions.some(
      (exception) =>
        exception.ruleId === ruleId &&
        exception.slotId === context.slotId &&
        exception.match === match &&
        exception.context === contextOf(text, start, end),
    )
  const push = (
    ruleId: string,
    label: string,
    category: string,
    start: number,
    end: number,
    message: string,
    preferred: string | null,
    note = '',
  ) => {
    const match = text.slice(start, end)
    findings.push({
      key: `${ruleId}@${start}`,
      ruleId,
      label,
      category,
      start,
      end,
      match,
      message,
      preferred,
      note,
      context: contextOf(text, start, end),
      isException: isException(ruleId, match, start, end),
    })
  }

  for (const rule of sheet.rules) {
    if (!rule.enabled) continue
    const pattern = termPattern(rule, rule.terms)
    if (!pattern) continue
    const haystack = rule.ignoreAccents ? folded : text
    const matches = [...haystack.matchAll(pattern)].map((match) => ({
      start: match.index,
      end: match.index + match[0].length,
    }))
    const category = rule.category || ruleKindLabels[rule.kind]
    const label = ruleLabel(rule)
    if (rule.kind === 'PREFER') {
      for (const { start, end } of matches) {
        // The preferred form itself is never flagged.
        if (text.slice(start, end) === rule.preferred) continue
        push(rule.id, label, category, start, end, `Use “${rule.preferred}”.`, rule.preferred, rule.note)
      }
    } else if (rule.kind === 'AVOID') {
      for (const { start, end } of matches) {
        push(rule.id, label, category, start, end, 'Termo a evitar.', null, rule.note)
      }
    } else if (matches.length > rule.maxPerScene) {
      for (const { start, end } of matches) {
        push(
          rule.id,
          label,
          category,
          start,
          end,
          `Aparece ${matches.length} vezes nesta cena; o limite é ${rule.maxPerScene}.`,
          null,
          rule.note,
        )
      }
    }
  }

  const typography = sheet.typography
  const typo = (key: keyof TypographyConventions, pattern: RegExp, message: string, preferred: string | null, group = 0) => {
    if (!typography[key]) return
    const ruleId = typographyRuleId(key)
    for (const match of text.matchAll(pattern)) {
      const offset = group ? match[0].indexOf(match[group]) : 0
      const start = match.index + offset
      push(ruleId, typographyLabels[key].label, 'Tipografia', start, start + match[group].length, message, preferred)
    }
  }
  typo('dialogueDash', /^[ \t]*([-–])(?=\s*\S)/gm, 'Diálogo aberto com hífen ou meia-risca; use travessão.', '—', 1)
  typo('curlyQuotes', /"/g, 'Aspas retas; use aspas curvas.', '“ ”')
  typo('ellipsisCharacter', /\.{3}/g, 'Três pontos; use o caractere de reticências.', '…')
  typo('doubleSpaces', /(?<=\S) {2,}(?=\S)/g, 'Espaço duplo.', ' ')
  typo('spaceBeforePunctuation', /(?<=[\p{L}\p{N}]) +(?=[,.;:!?](?:\s|$))/gu, 'Espaço antes da pontuação.', '')
  if (typography.repeatedWords) {
    const ruleId = typographyRuleId('repeatedWords')
    for (const match of text.matchAll(/(?<![\p{L}\p{N}])([\p{L}]+)\s+\1(?![\p{L}\p{N}])/giu)) {
      push(ruleId, typographyLabels.repeatedWords.label, 'Tipografia', match.index, match.index + match[0].length, `“${match[1]}” repetida.`, match[1])
    }
  }
  if (typography.archiveNames && context.names?.length) {
    const ruleId = typographyRuleId('archiveNames')
    const canonical = new Map<string, string>()
    for (const name of context.names) {
      if (name.trim().length >= 3) canonical.set(foldAccents(name.trim()).toLocaleLowerCase('pt-BR'), name.trim())
    }
    const pattern = termPattern({ wholeWord: true, matchCase: false, ignoreAccents: true }, [...canonical.values()])
    if (pattern) {
      for (const match of folded.matchAll(pattern)) {
        const start = match.index
        const end = start + match[0].length
        const written = text.slice(start, end)
        const expected = canonical.get(match[0].toLocaleLowerCase('pt-BR'))
        // Only names written with a capital differ in a meaningful way:
        // a lowercase common word that happens to be a name isn't flagged.
        if (expected && written !== expected && /^\p{Lu}/u.test(written)) {
          push(ruleId, typographyLabels.archiveNames.label, 'Nomes', start, end, `No Arquivo: “${expected}”.`, expected)
        }
      }
    }
  }

  return findings.sort((a, b) => a.start - b.start || a.end - b.end)
}

/** The exception that keeps one occurrence, as stored in the sheet. */
export function exceptionFor(finding: StyleFinding, slotId: string): StyleException {
  return { ruleId: finding.ruleId, slotId, match: finding.match, context: finding.context }
}

export function sameException(a: StyleException, b: StyleException) {
  return a.ruleId === b.ruleId && a.slotId === b.slotId && a.match === b.match && a.context === b.context
}
