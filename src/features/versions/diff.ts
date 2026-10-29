/**
 * Text diffs for comparing versions: paragraphs are aligned first, then the
 * paragraphs that changed are compared word by word, as track changes show.
 */

export type DiffOp<T> = { type: 'same' | 'add' | 'del'; items: T[] }

/**
 * Myers' O(ND) diff over two sequences. Returns runs of equal, added and
 * removed items. `maxEdits` bounds the work: past it, null (too different).
 */
export function diffSequences<T>(a: T[], b: T[], equal: (x: T, y: T) => boolean = Object.is, maxEdits = 4000): DiffOp<T>[] | null {
  // Common head and tail first: most revisions touch a small middle.
  let start = 0
  while (start < a.length && start < b.length && equal(a[start], b[start])) start += 1
  let endA = a.length
  let endB = b.length
  while (endA > start && endB > start && equal(a[endA - 1], b[endB - 1])) {
    endA -= 1
    endB -= 1
  }
  const midA = a.slice(start, endA)
  const midB = b.slice(start, endB)
  const middle = myers(midA, midB, equal, maxEdits)
  if (!middle) return null
  const ops: DiffOp<T>[] = []
  const push = (type: DiffOp<T>['type'], items: T[]) => {
    if (items.length === 0) return
    const last = ops.at(-1)
    if (last?.type === type) last.items.push(...items)
    else ops.push({ type, items: [...items] })
  }
  push('same', a.slice(0, start))
  for (const op of middle) push(op.type, op.items)
  push('same', a.slice(endA))
  return ops
}

function myers<T>(a: T[], b: T[], equal: (x: T, y: T) => boolean, maxEdits: number): DiffOp<T>[] | null {
  const n = a.length
  const m = b.length
  if (n === 0 && m === 0) return []
  if (n === 0) return [{ type: 'add', items: [...b] }]
  if (m === 0) return [{ type: 'del', items: [...a] }]
  const max = Math.min(n + m, maxEdits)
  const offset = max + 1
  let v = new Int32Array(2 * max + 3)
  const trace: Int32Array[] = []
  for (let d = 0; d <= max; d += 1) {
    trace.push(v.slice())
    const next = v.slice()
    for (let k = -d; k <= d; k += 2) {
      let x =
        k === -d || (k !== d && v[offset + k - 1] < v[offset + k + 1]) ? v[offset + k + 1] : v[offset + k - 1] + 1
      let y = x - k
      while (x < n && y < m && equal(a[x], b[y])) {
        x += 1
        y += 1
      }
      next[offset + k] = x
      if (x >= n && y >= m) {
        trace.push(next)
        return backtrack(trace, a, b, offset, d)
      }
    }
    v = next
  }
  return null
}

function backtrack<T>(trace: Int32Array[], a: T[], b: T[], offset: number, edits: number): DiffOp<T>[] {
  const steps: Array<{ type: DiffOp<T>['type']; item: T }> = []
  let x = a.length
  let y = b.length
  for (let d = edits; d > 0; d -= 1) {
    const v = trace[d]
    const k = x - y
    const prevK = k === -d || (k !== d && v[offset + k - 1] < v[offset + k + 1]) ? k + 1 : k - 1
    const prevX = v[offset + prevK]
    const prevY = prevX - prevK
    while (x > prevX && y > prevY) {
      x -= 1
      y -= 1
      steps.push({ type: 'same', item: a[x] })
    }
    if (x === prevX) {
      y -= 1
      steps.push({ type: 'add', item: b[y] })
    } else {
      x -= 1
      steps.push({ type: 'del', item: a[x] })
    }
  }
  while (x > 0 && y > 0) {
    x -= 1
    y -= 1
    steps.push({ type: 'same', item: a[x] })
  }
  const ops: DiffOp<T>[] = []
  for (const step of steps.reverse()) {
    const last = ops.at(-1)
    if (last?.type === step.type) last.items.push(step.item)
    else ops.push({ type: step.type, items: [step.item] })
  }
  return ops
}

export type Segment = { type: 'same' | 'add' | 'del'; text: string }

// One paragraph of the comparison: unchanged, wholly added or removed, or
// edited (with its words marked).
export type ParagraphDiff =
  | { type: 'same'; text: string }
  | { type: 'add' | 'del'; text: string }
  | { type: 'edit'; segments: Segment[] }

export const splitParagraphs = (text: string) =>
  text
    .replace(/\r\n?/g, '\n')
    .split(/\n+/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)

// Words with the space after them, so joining the tokens gives the text back.
const tokenize = (text: string) => text.match(/\S+\s*/g) ?? []
const sameWord = (x: string, y: string) => x.trimEnd() === y.trimEnd()

export function diffWords(before: string, after: string): Segment[] {
  const ops = diffSequences(tokenize(before), tokenize(after), sameWord)
  if (!ops) {
    return [
      { type: 'del', text: before },
      { type: 'add', text: after },
    ]
  }
  // Equal runs show the new spacing; changed runs keep their own.
  return ops.map((op) => ({ type: op.type, text: op.items.join('') }))
}

export const wordSet = (text: string) => new Set(text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [])

/** How much two paragraphs share, 0–1, by words. */
export function similarity(before: string, after: string) {
  return setSimilarity(wordSet(before), wordSet(after))
}

// Runs of three words: two different scenes of a book share many words but
// almost no three-word runs, while a revised scene keeps most of them.
export function shingleSet(text: string) {
  const words = text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []
  const shingles = new Set<string>()
  for (let index = 0; index + 2 < words.length; index += 1) {
    shingles.add(`${words[index]} ${words[index + 1]} ${words[index + 2]}`)
  }
  if (shingles.size === 0 && words.length) shingles.add(words.join(' '))
  return shingles
}

/** How much two scenes read alike, 0–1, by three-word runs. */
export function sceneSimilarity(before: string, after: string) {
  return setSimilarity(shingleSet(before), shingleSet(after))
}

export function setSimilarity(a: Set<string>, b: Set<string>) {
  if (a.size === 0 && b.size === 0) return 1
  let shared = 0
  for (const word of a) if (b.has(word)) shared += 1
  return shared / Math.max(a.size, b.size)
}

// Below this, a removed and an added paragraph are shown as a replacement,
// not as one edited paragraph.
const EDIT_SIMILARITY = 0.35

export function diffText(before: string, after: string): ParagraphDiff[] {
  const ops = diffSequences(splitParagraphs(before), splitParagraphs(after))
  if (!ops) {
    return [
      ...splitParagraphs(before).map((text) => ({ type: 'del' as const, text })),
      ...splitParagraphs(after).map((text) => ({ type: 'add' as const, text })),
    ]
  }
  const result: ParagraphDiff[] = []
  for (let index = 0; index < ops.length; index += 1) {
    const op = ops[index]
    if (op.type === 'same') {
      for (const text of op.items) result.push({ type: 'same', text })
      continue
    }
    // A removal followed by an addition: pair the paragraphs that are close
    // enough to read as edits of each other, in order.
    if (op.type === 'del' && ops[index + 1]?.type === 'add') {
      const removed = op.items
      const added = ops[index + 1].items
      index += 1
      let r = 0
      let a = 0
      while (r < removed.length || a < added.length) {
        if (r < removed.length && a < added.length && similarity(removed[r], added[a]) >= EDIT_SIMILARITY) {
          result.push({ type: 'edit', segments: diffWords(removed[r], added[a]) })
          r += 1
          a += 1
        } else if (r < removed.length && (a >= added.length || removed.length - r >= added.length - a)) {
          result.push({ type: 'del', text: removed[r] })
          r += 1
        } else {
          result.push({ type: 'add', text: added[a] })
          a += 1
        }
      }
      continue
    }
    for (const text of op.items) result.push({ type: op.type, text })
  }
  return result
}

/** Words added and removed by a paragraph diff. */
export function diffStats(paragraphs: ParagraphDiff[]) {
  const words = (text: string) => text.match(/\S+/g)?.length ?? 0
  let added = 0
  let removed = 0
  for (const paragraph of paragraphs) {
    if (paragraph.type === 'add') added += words(paragraph.text)
    else if (paragraph.type === 'del') removed += words(paragraph.text)
    else if (paragraph.type === 'edit') {
      for (const segment of paragraph.segments) {
        if (segment.type === 'add') added += words(segment.text)
        else if (segment.type === 'del') removed += words(segment.text)
      }
    }
  }
  return { added, removed }
}
