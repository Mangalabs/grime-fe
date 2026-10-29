/**
 * Line breaks in the middle of a sentence ("ele\nconhecia aquele rosto"),
 * left by copying from a PDF or a fixed-width file. A break counts as one
 * when the line before it doesn't end a sentence and the next line goes on
 * in lower case; dialogue lines and new paragraphs are left alone.
 */
const SOFT_WRAP = /([^\s.!?…:;"”»)\]])[^\S\n]*\n[^\S\n]*(?=\p{Ll})/gu

/** One break: the whitespace around it, which joining turns into a space. */
export interface SoftWrap {
  start: number
  end: number
}

/** The mid-sentence breaks of a text, in order. */
export function findSoftWraps(text: string): SoftWrap[] {
  return [...text.matchAll(SOFT_WRAP)].map((match) => ({
    start: match.index + match[1].length,
    end: match.index + match[0].length,
  }))
}

/** The text with the given breaks (by default, all of them) turned into spaces. */
export function joinSoftWraps(text: string, wraps: SoftWrap[] = findSoftWraps(text)): string {
  let joined = ''
  let from = 0
  for (const wrap of [...wraps].sort((a, b) => a.start - b.start)) {
    joined += `${text.slice(from, wrap.start)} `
    from = wrap.end
  }
  return joined + text.slice(from)
}
