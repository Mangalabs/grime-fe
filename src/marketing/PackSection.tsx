import { strToU8, zipSync } from 'fflate'
import { useMemo, useState } from 'react'
import type { MarketingKit } from './marketingKit'
import type { MoodboardImages } from './useMoodboardImages'
import { bookFile, buildWorldPack, moodboardFile, worldPackJsonSchema, type StoryData, type WorldPack } from './worldPack'

// For whoever (or whatever AI) builds the site from the pack.
const readme = `# Pacote do mundo (Petricor)

- world-pack.json: o que o site pode usar, já cortado para o público escolhido.
  Cada item tem "level": PUBLIC aparece como está; TEASER deve ser insinuado
  (censurado, trancado, desbloqueável). Spoilers nunca estão aqui.
- world-pack.schema.json: o JSON Schema do arquivo acima.
- book/: a capa e a foto do autor, para usar no site.
- moodboard/: imagens de referência. Só as com "publishable": true podem
  aparecer no site; as outras guiam a direção de arte (luz, cor, textura).

Comece por identity: a paleta (use os papéis como tokens de cor), as fontes
(Google Fonts), os materiais, a luz e os objetos diegéticos — a navegação do
site acontece por eles, a partir do que tem role "HUB"; o que o visitante lê está
em entries de cada objeto. book traz capa, sinopse, links e a chamada principal
(primaryLinkId), que é o botão que o site inteiro deve levar a clicar.
`

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000)
}

const download = (text: string, fileName: string) => downloadBlob(new Blob([text], { type: 'application/json' }), fileName)

function slug(title: string) {
  return (
    title
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'projeto'
  )
}

function counts(pack: WorldPack) {
  return {
    entities: pack.entities.length,
    facts: pack.entities.reduce((total, entity) => total + entity.facts.length, 0),
    fichas: pack.entities.filter((entity) => entity.page).length,
    fields: pack.entities.reduce(
      (total, entity) =>
        total +
        (entity.page?.sections.reduce((sum, section) => sum + section.fields.length, 0) ?? 0) +
        (entity.page?.summary ? 1 : 0),
      0,
    ),
    scenes: pack.scenes.length,
  }
}

export function PackSection({
  story,
  kit,
  images,
  hasUnsavedChanges,
}: {
  story: StoryData
  kit: MarketingKit
  images: MoodboardImages
  hasUnsavedChanges: boolean
}) {
  const [includeTeasers, setIncludeTeasers] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const [zipState, setZipState] = useState<{ busy: boolean; error: string }>({ busy: false, error: '' })

  // Built from what is on screen, saved or not: the file is what you see.
  const result = useMemo(() => {
    try {
      return { pack: buildWorldPack(story, kit, { includeTeasers }), error: '' }
    } catch (reason) {
      return { pack: null, error: reason instanceof Error ? reason.message : 'O pacote não passou na validação.' }
    }
  }, [story, kit, includeTeasers])
  const json = result.pack ? JSON.stringify(result.pack, null, 2) : ''
  const summary = result.pack ? counts(result.pack) : null
  const baseName = `${slug(story.title)}-world-pack${includeTeasers ? '-teasers' : ''}`

  // The whole pack: JSON, schema, a short README and the moodboard images,
  // decrypted here. The .zip itself is not encrypted: keep it safe.
  async function downloadZip() {
    setZipState({ busy: true, error: '' })
    try {
      const files: Record<string, Uint8Array> = {
        'world-pack.json': strToU8(json),
        'world-pack.schema.json': strToU8(JSON.stringify(worldPackJsonSchema(), null, 2)),
        'LEIA-ME.md': strToU8(readme),
      }
      const bytes = async (image: { assetId: string; mimeType: string }) =>
        new Uint8Array(await (await images.blobFor(image)).arrayBuffer())
      for (const image of kit.identity.moodboard) files[moodboardFile(image)] = await bytes(image)
      if (kit.book.cover) files[bookFile('cover', kit.book.cover)] = await bytes(kit.book.cover)
      if (kit.book.authorPhoto) files[bookFile('author', kit.book.authorPhoto)] = await bytes(kit.book.authorPhoto)
      // Images are already compressed; zipping them again only costs time.
      const zipped = zipSync(
        Object.fromEntries(
          Object.entries(files).map(([name, data]) => [name, [data, { level: name.startsWith('moodboard/') ? 0 : 6 }]]),
        ),
      )
      downloadBlob(new Blob([zipped as Uint8Array<ArrayBuffer>], { type: 'application/zip' }), `${baseName}.zip`)
      setZipState({ busy: false, error: '' })
    } catch (reason) {
      setZipState({ busy: false, error: reason instanceof Error ? reason.message : 'Não foi possível montar o .zip.' })
    }
  }

  return (
    <>
      <header className="page-intro admin-intro">
        <p className="eyebrow">Marketing</p>
        <h1>Pacote do mundo</h1>
        <p>
          Um arquivo JSON com o que o site do livro pode usar, já cortado para o público escolhido. É montado aqui no
          navegador: o texto das cenas nunca entra, e spoilers também não.
        </p>
      </header>

      <section className="admin-card mk-audience">
        <h3>Público</h3>
        <label className="mk-radio">
          <input checked={!includeTeasers} type="radio" onChange={() => setIncludeTeasers(false)} />
          <span>
            <strong>Só o que é público</strong>
            <span className="admin-muted admin-note">Para páginas abertas, sem nada a descobrir.</span>
          </span>
        </label>
        <label className="mk-radio">
          <input checked={includeTeasers} type="radio" onChange={() => setIncludeTeasers(true)} />
          <span>
            <strong>Público e teasers</strong>
            <span className="admin-muted admin-note">
              Para narrativas com pistas: cada item leva o nível, e o site decide como insinuar os teasers.
            </span>
          </span>
        </label>
      </section>

      {result.error && <p className="form-message">{result.error}</p>}

      {summary && (
        <section className="admin-card">
          <div className="admin-tiles mk-counts">
            {[
              { label: 'Entidades', value: summary.entities },
              { label: 'Fichas', value: summary.fichas },
              { label: 'Campos de ficha', value: summary.fields },
              { label: 'Fatos', value: summary.facts },
              { label: 'Cenas (sem texto)', value: summary.scenes },
            ].map((tile) => (
              <div className="admin-tile" key={tile.label}>
                <span className="admin-tile-label">{tile.label}</span>
                <strong>{tile.value.toLocaleString('pt-BR')}</strong>
              </div>
            ))}
          </div>
          {zipState.error && <p className="form-message">{zipState.error}</p>}
          {hasUnsavedChanges && (
            <p className="admin-muted">O pacote já reflete as alterações ainda não salvas.</p>
          )}
          <div className="admin-card-foot">
            <span className="admin-card-actions">
              <button className="button button-primary" disabled={zipState.busy} type="button" onClick={() => void downloadZip()}>
                {zipState.busy ? 'Montando…' : 'Baixar pacote (.zip)'}
              </button>
              <button className="button button-secondary" type="button" onClick={() => download(json, `${baseName}.json`)}>
                Só o JSON
              </button>
            </span>
            <button className="text-button" type="button" onClick={() => setShowPreview((value) => !value)}>
              {showPreview ? 'Esconder prévia' : 'Ver prévia'}
            </button>
          </div>
          {showPreview && <pre className="mk-preview-json">{json}</pre>}
        </section>
      )}
    </>
  )
}
