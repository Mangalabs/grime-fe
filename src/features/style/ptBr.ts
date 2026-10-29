/**
 * Brazilian Portuguese copyediting conventions, checked deterministically:
 * spellings from before the 2009 orthographic agreement, prefix hyphens,
 * punctuation spacing, ordinals and a few safe grammar cases. Each check
 * proposes an exact replacement when one is certain, or none when only a
 * person can decide (numbers in words depend on gender, for instance).
 */

export type PtBrRule =
  | 'orthographyAgreement'
  | 'prefixHyphen'
  | 'porQueEnd'
  | 'craseBeforeMasculine'
  | 'spaceAfterPunctuation'
  | 'repeatedPunctuation'
  | 'ordinals'
  | 'dialogueSpace'
  | 'numbersInWords'

export interface PtBrHit {
  rule: PtBrRule
  start: number
  end: number
  replacement: string | null
  message: string
}

/** Keeps the capitalisation of what was written: "Idéia" → "Ideia". */
export function keepCase(written: string, replacement: string) {
  if (!replacement) return replacement
  if (written.length > 1 && written === written.toLocaleUpperCase('pt-BR') && /\p{Lu}/u.test(written)) {
    return replacement.toLocaleUpperCase('pt-BR')
  }
  if (/^\p{Lu}/u.test(written)) return replacement[0].toLocaleUpperCase('pt-BR') + replacement.slice(1)
  return replacement
}

const L = '\\p{L}'
// Not inside a longer word.
const before = `(?<![${L}\\p{N}])`
const after = `(?![${L}\\p{N}])`

// Spellings the agreement changed that no pattern below covers.
const agreementWords: Record<string, string> = {
  'pára': 'para',
  'pêlo': 'pelo',
  'pêlos': 'pelos',
  'pólo': 'polo',
  'pólos': 'polos',
  'pêra': 'pera',
  'pêras': 'peras',
  'dia-a-dia': 'dia a dia',
  'fim-de-semana': 'fim de semana',
  'fins-de-semana': 'fins de semana',
  'pé-de-moleque': 'pé de moleque',
  'mão-de-obra': 'mão de obra',
  'cara-de-pau': 'cara de pau',
  'pára-quedas': 'paraquedas',
  'pára-quedista': 'paraquedista',
  'pára-choque': 'para-choque',
  'pára-choques': 'para-choques',
  'pára-brisa': 'para-brisa',
  'pára-brisas': 'para-brisas',
  'pára-raios': 'para-raios',
  'manda-chuva': 'mandachuva',
  'co-autor': 'coautor',
  'co-autora': 'coautora',
  'co-autoria': 'coautoria',
  'co-piloto': 'copiloto',
}

const agreementWordPattern = new RegExp(
  `${before}(?:${Object.keys(agreementWords)
    .sort((a, b) => b.length - a.length)
    .join('|')})${after}`,
  'giu',
)

// Prefixes that end in a vowel, joined to the next word since the agreement
// unless it starts with h or the same vowel; r and s double.
const prefixes = [
  'auto', 'anti', 'contra', 'extra', 'infra', 'intra', 'ultra', 'semi', 'mini', 'micro', 'macro', 'multi',
  'neo', 'proto', 'pseudo', 'supra', 'retro', 'mega', 'tele', 'agro', 'eletro', 'hidro', 'socio', 'arqui', 'maxi', 'poli',
]
const prefixPattern = new RegExp(`${before}(${prefixes.join('|')})-(${L}+)`, 'giu')

const fold = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()

function joinPrefix(prefix: string, word: string): string | null {
  // A proper name keeps the hyphen: "anti-Brasil".
  if (/^\p{Lu}/u.test(word) && !/^\p{Lu}+$/u.test(prefix)) return null
  const first = fold(word[0])
  const last = fold(prefix.at(-1) ?? '')
  if (first === 'h' || first === last) return null
  if (first === 'r' || first === 's') return `${prefix}${word[0]}${word}`
  return `${prefix}${word}`
}

const numberWords = ['zero', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez']

export function checkPtBr(text: string, enabled: (rule: PtBrRule) => boolean): PtBrHit[] {
  const hits: PtBrHit[] = []
  const add = (rule: PtBrRule, start: number, end: number, replacement: string | null, message: string) =>
    hits.push({ rule, start, end, replacement, message })

  if (enabled('orthographyAgreement')) {
    const message = 'Grafia anterior ao Acordo Ortográfico.'
    // Trema: only in gu/qu, so names like Müller stay.
    for (const match of text.matchAll(new RegExp(`${before}${L}*[gq][üÜ]${L}*`, 'giu'))) {
      add('orthographyAgreement', match.index, match.index + match[0].length, match[0].replace(/ü/g, 'u').replace(/Ü/g, 'U'), message)
    }
    // Open diphthongs éi/ói in paroxytones: idéia, jóia, heróico, apóio.
    for (const match of text.matchAll(new RegExp(`${before}(${L}*)([éó])(i)(as?|os?|cas?|cos?)${after}`, 'giu'))) {
      const plain = match[2] === 'é' ? 'e' : match[2] === 'ó' ? 'o' : match[2] === 'É' ? 'E' : 'O'
      add('orthographyAgreement', match.index, match.index + match[0].length, `${match[1]}${plain}${match[3]}${match[4]}`, message)
    }
    // vôo, enjôo, perdôo.
    for (const match of text.matchAll(new RegExp(`${before}(${L}*)ôo(s?)${after}`, 'giu'))) {
      add('orthographyAgreement', match.index, match.index + match[0].length, `${match[1]}oo${match[2]}`, message)
    }
    // lêem, crêem, dêem, vêem (and compounds).
    for (const match of text.matchAll(new RegExp(`${before}(l|cr|d|v|rel|descr|prev|rev|antev)êem${after}`, 'giu'))) {
      add('orthographyAgreement', match.index, match.index + match[0].length, `${match[1]}eem`, message)
    }
    for (const match of text.matchAll(agreementWordPattern)) {
      const replacement = agreementWords[match[0].toLocaleLowerCase('pt-BR')]
      if (replacement) add('orthographyAgreement', match.index, match.index + match[0].length, keepCase(match[0], replacement), message)
    }
  }

  if (enabled('prefixHyphen')) {
    for (const match of text.matchAll(prefixPattern)) {
      const joined = joinPrefix(match[1], match[2])
      if (joined) {
        add('prefixHyphen', match.index, match.index + match[0].length, joined, 'Prefixo sem hífen pelo Acordo Ortográfico.')
      }
    }
  }

  if (enabled('porQueEnd')) {
    // "por que" / "porque" right before the end of a question or sentence.
    for (const match of text.matchAll(new RegExp(`${before}(por que|porque)(?=\\s*[?!.…])`, 'giu'))) {
      add('porQueEnd', match.index, match.index + match[0].length, keepCase(match[0], 'por quê'), 'No fim da frase, “por quê”, com acento.')
    }
  }

  if (enabled('craseBeforeMasculine')) {
    const words = 'partir|ele|eles|este|estes|esse|esses|isso|isto|aquilo|você|vocês|mim|ti|nós|vós|cavalo|pé|prazo'
    for (const match of text.matchAll(new RegExp(`${before}[àÀ](?= (?:${words})${after})`, 'gu'))) {
      add('craseBeforeMasculine', match.index, match.index + 1, keepCase(match[0], 'a'), 'Sem crase antes de verbo, pronome ou palavra masculina.')
    }
  }

  if (enabled('spaceAfterPunctuation')) {
    // "fim.Começo", "isso,aquilo": letters on both sides, so 3,5 and 1.000
    // stay; after a period only a capital counts, so "a.C." and sites stay.
    for (const match of text.matchAll(/(?<=\p{Ll}{2})(?:[,;!?](?=\p{L})|[.:](?=\p{Lu}\p{Ll}))/gu)) {
      add('spaceAfterPunctuation', match.index, match.index + 1, `${match[0]} `, 'Falta espaço depois da pontuação.')
    }
  }

  if (enabled('repeatedPunctuation')) {
    for (const match of text.matchAll(/([!?,;:])\1+/g)) {
      add('repeatedPunctuation', match.index, match.index + match[0].length, match[1], 'Pontuação repetida.')
    }
    for (const match of text.matchAll(/(?<!\.)\.\.(?!\.)|\.{4,}/g)) {
      add('repeatedPunctuation', match.index, match.index + match[0].length, match[0].length === 2 ? '.' : '…', 'Pontos repetidos.')
    }
  }

  if (enabled('ordinals')) {
    for (const match of text.matchAll(new RegExp(`${before}(\\d{1,4})([oa])${after}`, 'gu'))) {
      add('ordinals', match.index, match.index + match[0].length, `${match[1]}${match[2] === 'o' ? 'º' : 'ª'}`, 'Ordinal com o sinal próprio (º, ª).')
    }
    // "n°" or "no." before a number; a bare "no 5" is usually the preposition.
    for (const match of text.matchAll(new RegExp(`${before}([Nn])(?:°|o\\.)(?=\\s*\\d)`, 'gu'))) {
      add('ordinals', match.index, match.index + match[0].length, `${match[1]}º`, 'Abreviatura de número: nº.')
    }
  }

  if (enabled('dialogueSpace')) {
    // The dash stands apart from the words around it: "— Oi — disse ela."
    for (const match of text.matchAll(/—(?=\p{L})/gu)) {
      add('dialogueSpace', match.index, match.index + 1, '— ', 'Travessão sem espaço depois.')
    }
    for (const match of text.matchAll(/(?<=\p{L})—(?=\s)/gu)) {
      add('dialogueSpace', match.index, match.index + 1, ' —', 'Travessão sem espaço antes.')
    }
  }

  if (enabled('numbersInWords')) {
    // Lone digits from 0 to 10 in running text; not times, measures,
    // chapter or page numbers, dates or lists. Gender decides "um/uma", so
    // the correction is left to the reviewer.
    const pattern = /(?<![\p{L}\p{N}.,:/º-])(10|\d)(?![\p{L}\p{N}.,:/ºª%°-]|\s(?:h|min|km|kg|cm|mm|m|g|ml|l)(?!\p{L}))/gu
    for (const match of text.matchAll(pattern)) {
      const lead = text.slice(Math.max(0, match.index - 12), match.index).toLowerCase()
      if (/(cap[íi]tulo|cap\.|p[áa]gina|p\.|n[º°o]|parte|livro|vers[íi]culo|art\.|artigo)\s*$/.test(lead)) continue
      // A numbered list line ("1 Introdução" at the start) stays.
      if (match.index === 0 || text[match.index - 1] === '\n') continue
      add('numbersInWords', match.index, match.index + match[0].length, null, `Por extenso: “${numberWords[Number(match[0])]}”.`)
    }
  }

  return hits
}

/** Applies replacements to a text, last first, skipping any that overlap. */
export function applyReplacements(text: string, edits: Array<{ start: number; end: number; replacement: string }>) {
  let result = text
  let limit = Infinity
  for (const edit of [...edits].sort((a, b) => b.start - a.start || b.end - a.end)) {
    if (edit.end > limit) continue
    result = result.slice(0, edit.start) + edit.replacement + result.slice(edit.end)
    limit = edit.start
  }
  return result
}
