import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../api/client'
import { decryptBytes, encryptBytes } from '../crypto/projectEncryption'
import type { MoodImage } from './identityModel'
import { prepareImage } from './images'

/**
 * The moodboard's images, decrypted in the browser and shown from object URLs
 * that are released when the workspace closes.
 */
export function useMoodboardImages(projectId: string, projectKey: CryptoKey) {
  const [urls, setUrls] = useState<Record<string, string>>({})
  const blobs = useRef(new Map<string, Blob>())
  const loading = useRef(new Set<string>())
  const created = useRef<string[]>([])

  useEffect(() => {
    const list = created.current
    return () => list.forEach((url) => URL.revokeObjectURL(url))
  }, [])

  const show = useCallback((assetId: string, blob: Blob) => {
    const url = URL.createObjectURL(blob)
    created.current.push(url)
    setUrls((current) => ({ ...current, [assetId]: url }))
  }, [])

  /** The decrypted image (fetched once, then kept). */
  const blobFor = useCallback(
    async (image: Pick<MoodImage, 'assetId' | 'mimeType'>): Promise<Blob> => {
      const cached = blobs.current.get(image.assetId)
      if (cached) return cached
      const sealed = await api.getMarketingAsset(projectId, image.assetId)
      const blob = new Blob([await decryptBytes(projectKey, sealed)], { type: image.mimeType })
      blobs.current.set(image.assetId, blob)
      return blob
    },
    [projectId, projectKey],
  )

  const ensureLoaded = useCallback(
    (images: Array<Pick<MoodImage, 'assetId' | 'mimeType'>>) => {
      images
        .filter((image) => !loading.current.has(image.assetId))
        .forEach((image) => {
          loading.current.add(image.assetId)
          void blobFor(image)
            .then((blob) => show(image.assetId, blob))
            .catch(() => loading.current.delete(image.assetId))
        })
    },
    [blobFor, show],
  )

  /** Shrinks, encrypts and uploads; returns what the kit records about it. */
  async function upload(file: File): Promise<Omit<MoodImage, 'id' | 'caption' | 'uses' | 'publishable'>> {
    const prepared = await prepareImage(file)
    const stored = await api.uploadMarketingAsset(projectId, await encryptBytes(projectKey, prepared.bytes))
    const blob = new Blob([prepared.bytes], { type: prepared.mimeType })
    blobs.current.set(stored.id, blob)
    loading.current.add(stored.id)
    show(stored.id, blob)
    return { assetId: stored.id, mimeType: prepared.mimeType, width: prepared.width, height: prepared.height }
  }

  return { urls, ensureLoaded, blobFor, upload }
}

export type MoodboardImages = ReturnType<typeof useMoodboardImages>
