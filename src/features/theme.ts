export type Theme = 'light' | 'dark'

function readStoredTheme(): Theme | null {
  try {
    const stored = localStorage.getItem('grime-theme')
    return stored === 'dark' || stored === 'light' ? stored : null
  } catch {
    return null
  }
}

// An explicit choice wins; otherwise the OS preference applies.
export function initialTheme(): Theme {
  return (
    readStoredTheme() ??
    (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
  )
}
