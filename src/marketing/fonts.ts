import { useEffect } from 'react'
import { googleFontsHref } from './identityModel'

/**
 * Loads the chosen Google Fonts for the previews. Only the family names are
 * sent to Google, never any of the book's text.
 */
export function useGoogleFonts(families: string[]) {
  const href = googleFontsHref(families)
  useEffect(() => {
    if (!href) return
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = href
    document.head.append(link)
    return () => link.remove()
  }, [href])
}

export const fontStack = (family: string, fallback: 'serif' | 'sans-serif' | 'cursive') =>
  family.trim() ? `"${family.trim()}", ${fallback}` : fallback
