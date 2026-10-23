import type { CSSProperties } from 'react'
import { artifactKindLabels, contrastRatio, swatchFor, type IdentityKit } from './identityModel'
import { fontStack } from './fonts'

/**
 * A style tile: the kit rendered as a fragment of the future site, so the
 * palette, letters and materials are judged together, not one by one.
 */
export function StyleTile({
  title,
  identity,
  imageUrl,
}: {
  title: string
  identity: IdentityKit
  imageUrl: string | null
}) {
  const color = (role: Parameters<typeof swatchFor>[1], fallback: string) => swatchFor(identity, role)?.hex ?? fallback
  const background = color('BACKGROUND', '#f4f1ea')
  const surface = color('SURFACE', '#ffffff')
  const ink = color('INK', '#222222')
  const accent = color('ACCENT', '#8a6d3b')
  const highlight = color('HIGHLIGHT', accent)
  // Text sits on the background (titles) and on the surface (objects).
  const titleInk = contrastRatio(ink, background) >= 4.5 ? ink : surface
  const artifact = identity.artifacts[0]
  const line = identity.sampleLine.trim() || identity.essence.promise.trim()

  const style = {
    '--tile-bg': background,
    '--tile-surface': surface,
    '--tile-ink': ink,
    '--tile-title-ink': titleInk,
    '--tile-accent': accent,
    '--tile-highlight': highlight,
    '--tile-display': fontStack(identity.typography.display, 'serif'),
    '--tile-body': fontStack(identity.typography.body, 'serif'),
    '--tile-hand': fontStack(identity.typography.accent || identity.typography.body, 'cursive'),
  } as CSSProperties

  return (
    <figure className="mk-tile" style={style}>
      <div className="mk-tile-hero" style={imageUrl ? { backgroundImage: `url(${imageUrl})` } : undefined}>
        <span className="mk-tile-setting">
          {[identity.essence.setting, identity.essence.place].filter(Boolean).join(' · ') || 'Cenário'}
        </span>
        <h3>{title}</h3>
        {line && <p className="mk-tile-line">{line}</p>}
      </div>

      {identity.mood.words.length > 0 && (
        <ul className="mk-tile-words">
          {identity.mood.words.slice(0, 5).map((word) => (
            <li key={word}>{word}</li>
          ))}
        </ul>
      )}

      <div className="mk-tile-object">
        <span className="mk-tile-kind">{artifact ? artifactKindLabels[artifact.kind] : 'Objeto diegético'}</span>
        <strong>{artifact?.title || 'Um objeto do mundo do livro'}</strong>
        <p>{artifact?.description || 'Uma carta, um diário, um mapa: é por ele que o visitante navega.'}</p>
        <span className="mk-tile-hand">{artifact?.reveals || 'abra para ver…'}</span>
        <button type="button" tabIndex={-1}>
          Abrir
        </button>
      </div>

      <div className="mk-tile-strip" aria-hidden="true">
        {(identity.palette.length ? identity.palette : [{ id: 'x', hex: background }]).map((swatch) => (
          <span key={swatch.id} style={{ background: swatch.hex }} />
        ))}
      </div>

      {identity.materials.length > 0 && (
        <figcaption className="mk-tile-materials">{identity.materials.slice(0, 6).join(' · ')}</figcaption>
      )}
    </figure>
  )
}
