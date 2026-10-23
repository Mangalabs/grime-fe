// Big enough for a full-bleed hero on a large screen; anything larger is
// weight without detail anyone sees.
const MAX_EDGE = 2400

export interface PreparedImage {
  bytes: ArrayBuffer
  mimeType: string
  width: number
  height: number
}

async function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality))
}

/** Shrinks the image to MAX_EDGE and re-encodes it (WebP, else JPEG). */
export async function prepareImage(file: File): Promise<PreparedImage> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height))
  const width = Math.round(bitmap.width * scale)
  const height = Math.round(bitmap.height * scale)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()
  // Safari can't encode WebP: it hands back PNG, which we don't want.
  let blob = await toBlob(canvas, 'image/webp', 0.88)
  if (!blob || blob.type !== 'image/webp') blob = await toBlob(canvas, 'image/jpeg', 0.88)
  if (!blob) throw new Error('Não foi possível ler esta imagem.')
  return { bytes: await blob.arrayBuffer(), mimeType: blob.type, width, height }
}

const hex = (value: number) => value.toString(16).padStart(2, '0')

/**
 * The image's main colours, most present first and clearly different from
 * one another: a starting palette, not a final one.
 */
export async function extractColors(blob: Blob, count = 6): Promise<string[]> {
  const bitmap = await createImageBitmap(blob)
  const size = 64
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const context = canvas.getContext('2d', { willReadFrequently: true })!
  context.drawImage(bitmap, 0, 0, size, size)
  bitmap.close()
  const { data } = context.getImageData(0, 0, size, size)

  // 4 bits per channel: close shades fall in the same bucket.
  const buckets = new Map<number, { r: number; g: number; b: number; n: number }>()
  for (let index = 0; index < data.length; index += 4) {
    if (data[index + 3] < 128) continue
    const [r, g, b] = [data[index], data[index + 1], data[index + 2]]
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4)
    const bucket = buckets.get(key) ?? { r: 0, g: 0, b: 0, n: 0 }
    bucket.r += r
    bucket.g += g
    bucket.b += b
    bucket.n += 1
    buckets.set(key, bucket)
  }

  const picked: Array<[number, number, number]> = []
  const distance = (a: [number, number, number], b: [number, number, number]) =>
    Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
  for (const bucket of [...buckets.values()].sort((a, b) => b.n - a.n)) {
    const color: [number, number, number] = [bucket.r / bucket.n, bucket.g / bucket.n, bucket.b / bucket.n].map(Math.round) as [
      number,
      number,
      number,
    ]
    if (picked.every((other) => distance(color, other) > 48)) picked.push(color)
    if (picked.length === count) break
  }
  return picked.map(([r, g, b]) => `#${hex(r)}${hex(g)}${hex(b)}`)
}
