/**
 * Runs `run` on every item, at most `limit` at a time, and returns the results
 * in the items' order. `onDone` is called after each item. Fails on the first
 * error (the items already started still finish).
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  run: (item: T) => Promise<R>,
  onDone?: () => void,
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let next = 0
  async function worker() {
    while (next < items.length) {
      const index = next
      next += 1
      results[index] = await run(items[index])
      onDone?.()
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}
