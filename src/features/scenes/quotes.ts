/**
 * Finding a model's quote in the scene text. Models copy the words but not
 * always the typography: line breaks become spaces, dashes and quote marks
 * change kind, and long quotes get cut with "...". The match ignores those
 * differences and answers with the span in the original text. Same rules as
 * the server's domain/text/quotes.ts.
 */

export type QuoteSpan = { start: number; end: number }

// Shortest quote, in words, still trusted after cutting a trailing "...".
const MIN_TRUNCATED_WORDS = 5

function canonicalChar(char: string): string {
  if (/\s/u.test(char)) return ' '
  if (/[‐‑‒–—―−-]/u.test(char)) return '-'
  if (/[“”„‟«»"]/u.test(char)) return '"'
  if (/[‘’‚‛']/u.test(char)) return "'"
  return char
}

/** The text with typography folded, and where each folded char came from. */
function fold(text: string): { folded: string; origins: number[] } {
  let folded = ''
  const origins: number[] = []
  for (let index = 0; index < text.length; index += 1) {
    const raw = text[index]
    const char = raw === '…' ? '...' : canonicalChar(raw)
    // Runs of spaces count as one.
    if (char === ' ' && folded.endsWith(' ')) continue
    for (const part of char) {
      folded += part
      origins.push(index)
    }
  }
  return { folded, origins }
}

function spanOf(text: string, needle: string, near?: number): QuoteSpan | null {
  if (!needle) return null
  const { folded, origins } = fold(text)
  let best = -1
  for (let at = folded.indexOf(needle); at >= 0; at = folded.indexOf(needle, at + 1)) {
    if (best < 0 || near === undefined) {
      best = at
      if (near === undefined) break
    } else if (Math.abs(origins[at] - near) < Math.abs(origins[best] - near)) {
      best = at
    }
  }
  if (best < 0) return null
  return { start: origins[best], end: origins[best + needle.length - 1] + 1 }
}

/**
 * Where a quote sits in the text, or null when its words aren't there. A
 * quote cut short with "..." matches its first part, if long enough to trust.
 * With several matches, the one nearest `near` wins.
 */
export function locateQuote(text: string, quote: string, near?: number): QuoteSpan | null {
  if (!text || !quote.trim()) return null
  const exact = text.indexOf(quote)
  if (exact >= 0 && near === undefined) return { start: exact, end: exact + quote.length }
  const needle = fold(quote.trim()).folded.trim()
  const whole = spanOf(text, needle, near)
  if (whole) return whole

  const cut = needle.replace(/\s*\.{3,}\s*$/u, '').replace(/^\s*\.{3,}\s*/u, '')
  if (cut !== needle && cut.split(' ').length >= MIN_TRUNCATED_WORDS) return spanOf(text, cut, near)
  return null
}
