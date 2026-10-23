import { useEffect, useRef, useState } from 'react'
import { entityTypeLabel } from '../features/archive/entityModel'
import { ArtifactEntries } from './ArtifactEntries'
import { DraftCard, type DraftState } from './DraftCard'
import { cutPosition, spoilerLevelLabels, spoilerLevels, type MarketingKit, type SpoilerLevel } from './marketingKit'
import {
  applyPreset,
  artifactKindLabels,
  artifactKinds,
  artifactRoleLabels,
  artifactRoles,
  colorRoleLabels,
  colorRoles,
  contrastRatio,
  fontGroups,
  imageUseLabels,
  imageUses,
  newArtifact,
  newId,
  newMotif,
  presets,
  quoteUseLabels,
  quoteUses,
  scaleLabels,
  scales,
  swatchFor,
  temperatureLabels,
  temperatures,
  tempoLabels,
  tempos,
  type Artifact,
  type ArtifactKind,
  type ArtifactRole,
  type ColorRole,
  type IdentityKit,
  type MoodImage,
  type QuoteUse,
  type Scale,
  type Temperature,
  type Tempo,
} from './identityModel'
import { fontStack, useGoogleFonts } from './fonts'
import { EntitySelect, Field, TagInput } from './identityParts'
import { extractColors } from './images'
import { StyleTile } from './StyleTile'
import type { MoodboardImages } from './useMoodboardImages'
import { slotPositions, timeline, type StoryData } from './worldPack'
import './Identity.css'

const allFonts = fontGroups.flatMap((group) => group.fonts)

export function IdentitySection({
  projectId,
  projectKey,
  story,
  kit,
  images,
  draftState,
  onDraftState,
  onChange,
}: {
  projectId: string
  projectKey: CryptoKey
  story: StoryData
  kit: MarketingKit
  images: MoodboardImages
  draftState: DraftState | null
  onDraftState: (state: DraftState | null) => void
  onChange: (identity: IdentityKit) => void
}) {
  const { identity } = kit
  const set = <K extends keyof IdentityKit>(key: K, value: IdentityKit[K]) => onChange({ ...identity, [key]: value })
  const { typography } = identity
  useGoogleFonts([typography.display, typography.body, typography.accent])

  const { ensureLoaded } = images
  useEffect(() => ensureLoaded(identity.moodboard), [ensureLoaded, identity.moodboard])
  const hero =
    identity.moodboard.find((image) => image.uses.includes('PLACE') || image.uses.includes('LIGHT')) ?? identity.moodboard[0]

  return (
    <>
      <header className="page-intro admin-intro">
        <p className="eyebrow">Marketing</p>
        <h1>Identidade</h1>
        <p>
          Como o mundo deste livro se vê, soa e se sente. É daqui que o site, as ilustrações e os objetos pelos quais o
          visitante navega tiram o visual: quanto mais concreto, melhor o resultado.
        </p>
      </header>

      <div className="mk-identity">
        <div className="mk-identity-main">
          <DraftCard
            kit={kit}
            projectId={projectId}
            projectKey={projectKey}
            state={draftState}
            story={story}
            onApply={onChange}
            onState={onDraftState}
          />
          <PresetCard identity={identity} onChange={onChange} />

          <section className="admin-card mk-card" id="essencia">
            <h3>Essência</h3>
            <div className="mk-grid">
              <Field label="Cenário" placeholder="Fantasia medieval, contemporâneo…" value={identity.essence.setting} onChange={(setting) => set('essence', { ...identity.essence, setting })} />
              <Field label="Época" placeholder="Idade média imaginária, 2020s…" value={identity.essence.era} onChange={(era) => set('essence', { ...identity.essence, era })} />
              <Field label="Lugar" placeholder="Um castelo no norte, um apartamento em Toronto…" value={identity.essence.place} onChange={(place) => set('essence', { ...identity.essence, place })} />
              <Field label="Cultura e heranças" placeholder="Família nipo-canadense; uma corte de clãs…" value={identity.essence.culture} onChange={(culture) => set('essence', { ...identity.essence, culture })} />
            </div>
            <fieldset className="mk-choices">
              <legend className="mk-label">Escala</legend>
              {scales.map((scale) => (
                <label className="mk-radio" key={scale}>
                  <input checked={identity.essence.scale === scale} type="radio" onChange={() => set('essence', { ...identity.essence, scale: scale as Scale })} />
                  <span>{scaleLabels[scale]}</span>
                </label>
              ))}
            </fieldset>
            <Field label="Ponto de vista" placeholder="Primeira pessoa, diário; narrador distante…" value={identity.essence.pointOfView} onChange={(pointOfView) => set('essence', { ...identity.essence, pointOfView })} />
            <Field
              label="A promessa do site"
              hint="Em uma frase, o que o visitante vai viver. Ex.: entrar no apartamento dela e ler o que ela nunca disse."
              multiline
              value={identity.essence.promise}
              onChange={(promise) => set('essence', { ...identity.essence, promise })}
            />
          </section>

          <section className="admin-card mk-card" id="atmosfera">
            <h3>Atmosfera</h3>
            <TagInput label="Palavras do clima" placeholder="delicado, perigoso, nostálgico…" values={identity.mood.words} onChange={(words) => set('mood', { ...identity.mood, words })} />
            <div className="mk-grid">
              <label className="mk-field">
                <span className="mk-label">Temperatura emocional</span>
                <select value={identity.mood.temperature ?? ''} onChange={(event) => set('mood', { ...identity.mood, temperature: (event.target.value || null) as Temperature | null })}>
                  <option value="">—</option>
                  {temperatures.map((value) => (
                    <option key={value} value={value}>{temperatureLabels[value]}</option>
                  ))}
                </select>
              </label>
              <label className="mk-field">
                <span className="mk-label">Ritmo</span>
                <select value={identity.mood.tempo ?? ''} onChange={(event) => set('mood', { ...identity.mood, tempo: (event.target.value || null) as Tempo | null })}>
                  <option value="">—</option>
                  {tempos.map((value) => (
                    <option key={value} value={value}>{tempoLabels[value]}</option>
                  ))}
                </select>
              </label>
            </div>
            <Field label="Notas" multiline value={identity.mood.notes} onChange={(notes) => set('mood', { ...identity.mood, notes })} />
          </section>

          <PaletteCard identity={identity} images={images} onChange={onChange} />

          <section className="admin-card mk-card" id="tipografia">
            <h3>Tipografia</h3>
            <p className="admin-muted">Famílias do Google Fonts. Escolha da lista ou digite o nome exato de outra.</p>
            <datalist id="mk-fonts">
              {allFonts.map((font) => (
                <option key={font} value={font} />
              ))}
            </datalist>
            {(
              [
                ['display', 'Títulos', 'serif', 'O nome do livro, os títulos das páginas.'],
                ['body', 'Texto', 'serif', 'Trechos, descrições, cartas longas.'],
                ['accent', 'Mão ou máquina', 'cursive', 'A letra dos personagens: bilhetes, anotações, relatórios.'],
              ] as const
            ).map(([key, label, fallback, hint]) => (
              <div className="mk-font-row" key={key}>
                <label className="mk-field">
                  <span className="mk-label">{label}</span>
                  <span className="admin-muted admin-note">{hint}</span>
                  <input list="mk-fonts" value={typography[key]} onChange={(event) => set('typography', { ...typography, [key]: event.target.value })} />
                </label>
                <p className="mk-font-sample" style={{ fontFamily: fontStack(typography[key], fallback) }}>
                  {key === 'display' ? story.title : identity.sampleLine || 'A chuva começou antes de ela abrir a carta.'}
                </p>
              </div>
            ))}
            <Field label="Notas" value={typography.notes} onChange={(notes) => set('typography', { ...typography, notes })} />
          </section>

          <section className="admin-card mk-card" id="materia">
            <h3>Matéria, luz e som</h3>
            <TagInput label="Materiais e texturas" placeholder="pergaminho, washi, ferro, cerâmica…" values={identity.materials} onChange={(materials) => set('materials', materials)} />
            <Field label="Luz" multiline placeholder="Sol de fim de tarde pela persiana; tochas na pedra…" value={identity.light} onChange={(light) => set('light', light)} />
            <Field label="Som ambiente" placeholder="Chaleira, chuva, vento nas ameias…" value={identity.sound} onChange={(sound) => set('sound', sound)} />
            <Field label="Enquadramento" multiline placeholder="Close em mãos e objetos; a casa vista em cantos…" value={identity.composition} onChange={(composition) => set('composition', composition)} />
          </section>

          <MotifsCard identity={identity} story={story} onChange={onChange} />
          <ArtifactsCard identity={identity} story={story} onChange={onChange} />
          <QuotesCard identity={identity} kit={kit} story={story} onChange={onChange} />
          <MoodboardCard identity={identity} images={images} onChange={onChange} />

          <section className="admin-card mk-card" id="direcao">
            <h3>Direção para quem cria</h3>
            <TagInput label="Evitar" placeholder="clichês, estilos, cores…" values={identity.avoid} onChange={(avoid) => set('avoid', avoid)} />
            <Field
              label="Prompt de estilo"
              hint="A base para geradores de imagem; cada ilustração acrescenta o que mostra."
              multiline
              value={identity.stylePrompt}
              onChange={(stylePrompt) => set('stylePrompt', stylePrompt)}
            />
            <Field
              label="Frase de amostra"
              hint="Uma linha na voz do livro (pública), usada nas prévias."
              multiline
              value={identity.sampleLine}
              onChange={(sampleLine) => set('sampleLine', sampleLine)}
            />
          </section>
        </div>

        <aside className="mk-identity-aside">
          <StyleTile identity={identity} imageUrl={hero ? (images.urls[hero.assetId] ?? null) : null} title={story.title} />
          <p className="admin-muted mk-tile-note">Prévia viva: muda enquanto você edita.</p>
        </aside>
      </div>
    </>
  )
}

function PresetCard({ identity, onChange }: { identity: IdentityKit; onChange: (identity: IdentityKit) => void }) {
  const options = presets()
  const hasPalette = identity.palette.length > 0
  return (
    <section className="admin-card mk-card">
      <h3>Ponto de partida</h3>
      <p className="admin-muted">
        Preenche paleta, letras, materiais, luz e objetos com um conjunto coerente, para você ajustar ao livro. Lugar,
        cultura, promessa, motivos e moodboard ficam como estão.
      </p>
      <div className="mk-presets">
        {options.map((preset) => (
          <button
            aria-pressed={identity.presetId === preset.id}
            className="mk-preset"
            key={preset.id}
            type="button"
            onClick={() => {
              if (hasPalette && !window.confirm(`Aplicar "${preset.name}"? A paleta, as letras e os materiais atuais serão trocados.`)) return
              onChange(applyPreset(identity, preset))
            }}
          >
            <span className="mk-preset-strip" aria-hidden="true">
              {preset.identity.palette.map((swatch) => (
                <span key={swatch.id} style={{ background: swatch.hex }} />
              ))}
            </span>
            <strong>{preset.name}</strong>
            <span className="admin-muted">{preset.description}</span>
          </button>
        ))}
      </div>
    </section>
  )
}

function PaletteCard({
  identity,
  images,
  onChange,
}: {
  identity: IdentityKit
  images: MoodboardImages
  onChange: (identity: IdentityKit) => void
}) {
  const [suggested, setSuggested] = useState<string[]>([])
  const [isReading, setIsReading] = useState(false)
  const palette = identity.palette
  const setPalette = (next: IdentityKit['palette']) => onChange({ ...identity, palette: next })
  const ink = swatchFor(identity, 'INK')?.hex
  const checks = (['BACKGROUND', 'SURFACE'] as ColorRole[]).flatMap((role) => {
    const other = swatchFor(identity, role)?.hex
    return ink && other ? [{ role, ratio: contrastRatio(ink, other) }] : []
  })

  async function suggestFrom(image: MoodImage) {
    setIsReading(true)
    try {
      setSuggested(await extractColors(await images.blobFor(image)))
    } finally {
      setIsReading(false)
    }
  }

  return (
    <section className="admin-card mk-card" id="paleta">
      <h3>Paleta</h3>
      <p className="admin-muted">Cada cor com um papel. O site usa os papéis; os nomes ajudam quem ilustra.</p>
      <ul className="mk-swatches">
        {palette.map((swatch, index) => (
          <li key={swatch.id}>
            <input
              aria-label={`Cor ${swatch.name || index + 1}`}
              className="mk-color"
              type="color"
              value={swatch.hex}
              onChange={(event) => setPalette(palette.map((item) => (item.id === swatch.id ? { ...item, hex: event.target.value } : item)))}
            />
            <input
              aria-label="Nome da cor"
              placeholder="Nome (ex.: brasa)"
              value={swatch.name}
              onChange={(event) => setPalette(palette.map((item) => (item.id === swatch.id ? { ...item, name: event.target.value } : item)))}
            />
            <select
              aria-label="Papel da cor"
              value={swatch.role}
              onChange={(event) => setPalette(palette.map((item) => (item.id === swatch.id ? { ...item, role: event.target.value as ColorRole } : item)))}
            >
              {colorRoles.map((role) => (
                <option key={role} value={role}>{colorRoleLabels[role]}</option>
              ))}
            </select>
            <code>{swatch.hex}</code>
            <button aria-label={`Remover ${swatch.name || swatch.hex}`} className="text-button" type="button" onClick={() => setPalette(palette.filter((item) => item.id !== swatch.id))}>
              Remover
            </button>
          </li>
        ))}
      </ul>
      <button
        className="button button-secondary button-small"
        type="button"
        onClick={() => setPalette([...palette, { id: newId(), name: '', hex: '#8a6d3b', role: palette.length ? 'ACCENT' : 'BACKGROUND', note: '' }])}
      >
        Adicionar cor
      </button>

      {checks.map(({ role, ratio }) => (
        <p className={ratio < 4.5 ? 'form-message' : 'admin-muted'} key={role}>
          Contraste da tinta sobre {colorRoleLabels[role].toLowerCase()}: {ratio.toFixed(1)}:1
          {ratio < 4.5 ? ' — abaixo de 4,5:1, difícil de ler em textos longos.' : ' — bom para leitura.'}
        </p>
      ))}

      {identity.moodboard.length > 0 && (
        <div className="mk-suggest">
          <span className="mk-label">Tirar cores de uma imagem do moodboard</span>
          <div className="mk-suggest-images">
            {identity.moodboard.map((image) => (
              <button disabled={isReading} key={image.id} title={image.caption || 'Imagem do moodboard'} type="button" onClick={() => void suggestFrom(image)}>
                {images.urls[image.assetId] ? <img alt={image.caption} src={images.urls[image.assetId]} /> : <span>…</span>}
              </button>
            ))}
          </div>
          {suggested.length > 0 && (
            <div className="mk-suggest-colors">
              {suggested.map((hex) => (
                <button
                  key={hex}
                  style={{ background: hex }}
                  title={`Adicionar ${hex}`}
                  type="button"
                  onClick={() => setPalette([...palette, { id: newId(), name: '', hex, role: 'ACCENT', note: '' }])}
                >
                  <span>{hex}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  )
}

function MotifsCard({ identity, story, onChange }: { identity: IdentityKit; story: StoryData; onChange: (identity: IdentityKit) => void }) {
  const motifs = identity.motifs
  const update = (id: string, patch: Partial<IdentityKit['motifs'][number]>) =>
    onChange({ ...identity, motifs: motifs.map((motif) => (motif.id === id ? { ...motif, ...patch } : motif)) })
  return (
    <section className="admin-card mk-card" id="motivos">
      <h3>Motivos e símbolos</h3>
      <p className="admin-muted">O que volta na história e pode voltar no site: uma flor, um selo, a cor de um casaco.</p>
      {motifs.map((motif) => (
        <div className="mk-row-card" key={motif.id}>
          <div className="mk-grid">
            <Field label="Motivo" value={motif.name} onChange={(name) => update(motif.id, { name })} />
            <EntitySelect label="Ligado a" story={story} value={motif.entityId} onChange={(entityId) => update(motif.id, { entityId })} />
          </div>
          <Field label="O que significa" value={motif.meaning} onChange={(meaning) => update(motif.id, { meaning })} />
          <button className="text-button" type="button" onClick={() => onChange({ ...identity, motifs: motifs.filter((item) => item.id !== motif.id) })}>
            Remover motivo
          </button>
        </div>
      ))}
      <button className="button button-secondary button-small" type="button" onClick={() => onChange({ ...identity, motifs: [...motifs, newMotif()] })}>
        Adicionar motivo
      </button>
    </section>
  )
}

function ArtifactsCard({ identity, story, onChange }: { identity: IdentityKit; story: StoryData; onChange: (identity: IdentityKit) => void }) {
  const artifacts = identity.artifacts
  const update = (id: string, patch: Partial<Artifact>) =>
    onChange({ ...identity, artifacts: artifacts.map((artifact) => (artifact.id === id ? { ...artifact, ...patch } : artifact)) })
  const nameOf = new Map(story.entities.map((entity) => [entity.id, `${entity.name} (${entityTypeLabel(entity.type)})`]))
  return (
    <section className="admin-card mk-card" id="objetos">
      <h3>Objetos diegéticos</h3>
      <p className="admin-muted">
        Os objetos do mundo do livro que viram a interface do site: o visitante navega abrindo o diário, desdobrando o
        mapa, lendo as conversas. Um deles é o ponto de partida.
      </p>
      {artifacts.map((artifact) => (
        <div className="mk-row-card" key={artifact.id}>
          <div className="mk-grid">
            <label className="mk-field">
              <span className="mk-label">Tipo</span>
              <select value={artifact.kind} onChange={(event) => update(artifact.id, { kind: event.target.value as ArtifactKind })}>
                {artifactKinds.map((kind) => (
                  <option key={kind} value={kind}>{artifactKindLabels[kind]}</option>
                ))}
              </select>
            </label>
            <Field label="Nome" placeholder="O caderno dela, o mapa do reino…" value={artifact.title} onChange={(title) => update(artifact.id, { title })} />
            <EntitySelect label="De quem ou de onde" story={story} value={artifact.entityId} onChange={(entityId) => update(artifact.id, { entityId })} />
            <label className="mk-field">
              <span className="mk-label">Papel na navegação</span>
              <select value={artifact.role} onChange={(event) => update(artifact.id, { role: event.target.value as ArtifactRole })}>
                {artifactRoles.map((role) => (
                  <option key={role} value={role}>{artifactRoleLabels[role]}</option>
                ))}
              </select>
            </label>
          </div>
          <Field label="Como ele é" hint="Material, desgaste, letra, detalhes." multiline value={artifact.description} onChange={(description) => update(artifact.id, { description })} />
          <Field label="O que ele revela" multiline value={artifact.reveals} onChange={(reveals) => update(artifact.id, { reveals })} />
          <ArtifactEntries
            artifact={artifact}
            story={story}
            onChange={(next) => update(artifact.id, { entries: next.entries })}
          />
          <div className="mk-row-foot">
            <label className="mk-field mk-inline">
              <span className="mk-label">Nível</span>
              <select value={artifact.level} onChange={(event) => update(artifact.id, { level: event.target.value as SpoilerLevel })}>
                {spoilerLevels.map((level) => (
                  <option key={level} value={level}>{spoilerLevelLabels[level]}</option>
                ))}
              </select>
            </label>
            {artifact.entityId && (
              <span className="admin-muted">
                Ligado a {nameOf.get(artifact.entityId) ?? 'entidade removida'}: entra no pacote no nível mais restrito entre os dois.
              </span>
            )}
            <button className="text-button" type="button" onClick={() => onChange({ ...identity, artifacts: artifacts.filter((item) => item.id !== artifact.id) })}>
              Remover objeto
            </button>
          </div>
        </div>
      ))}
      <button className="button button-secondary button-small" type="button" onClick={() => onChange({ ...identity, artifacts: [...artifacts, newArtifact()] })}>
        Adicionar objeto
      </button>
    </section>
  )
}

function MoodboardCard({
  identity,
  images,
  onChange,
}: {
  identity: IdentityKit
  images: MoodboardImages
  onChange: (identity: IdentityKit) => void
}) {
  const input = useRef<HTMLInputElement>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState('')
  const moodboard = identity.moodboard
  const update = (id: string, patch: Partial<MoodImage>) =>
    onChange({ ...identity, moodboard: moodboard.map((image) => (image.id === id ? { ...image, ...patch } : image)) })

  async function add(files: FileList | null) {
    if (!files?.length) return
    setIsUploading(true)
    setError('')
    const added: MoodImage[] = []
    try {
      for (const file of Array.from(files)) {
        if (!file.type.startsWith('image/')) continue
        const stored = await images.upload(file)
        added.push({ ...stored, id: newId(), caption: '', uses: [], publishable: false })
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível enviar a imagem.')
    } finally {
      if (added.length) onChange({ ...identity, moodboard: [...moodboard, ...added] })
      setIsUploading(false)
      if (input.current) input.current.value = ''
    }
  }

  return (
    <section className="admin-card mk-card" id="moodboard">
      <h3>Moodboard</h3>
      <p className="admin-muted">
        Referências de luz, lugar, textura e gente. As imagens são reduzidas e cifradas aqui no navegador antes de
        subir. Marque como publicável só o que é seu ou licenciado; o resto guia a direção de arte e não vai para o site.
      </p>
      {error && <p className="form-message">{error}</p>}
      <div className="mk-moodboard">
        {moodboard.map((image) => (
          <figure className="mk-mood" key={image.id}>
            <div className="mk-mood-image">
              {images.urls[image.assetId] ? <img alt={image.caption} src={images.urls[image.assetId]} /> : <span className="admin-muted">Abrindo…</span>}
            </div>
            <figcaption>
              <input aria-label="Legenda" placeholder="O que ela mostra" value={image.caption} onChange={(event) => update(image.id, { caption: event.target.value })} />
              <span className="mk-uses">
                {imageUses.map((use) => (
                  <button
                    aria-pressed={image.uses.includes(use)}
                    key={use}
                    type="button"
                    onClick={() =>
                      update(image.id, {
                        uses: image.uses.includes(use) ? image.uses.filter((item) => item !== use) : [...image.uses, use],
                      })
                    }
                  >
                    {imageUseLabels[use]}
                  </button>
                ))}
              </span>
              <label className="admin-toggle">
                <input checked={image.publishable} type="checkbox" onChange={(event) => update(image.id, { publishable: event.target.checked })} />
                <span>Pode ir para o site</span>
              </label>
              <button className="text-button" type="button" onClick={() => onChange({ ...identity, moodboard: moodboard.filter((item) => item.id !== image.id) })}>
                Remover
              </button>
            </figcaption>
          </figure>
        ))}
      </div>
      <input accept="image/*" hidden multiple ref={input} type="file" onChange={(event) => void add(event.target.files)} />
      <button className="button button-secondary button-small" disabled={isUploading} type="button" onClick={() => input.current?.click()}>
        {isUploading ? 'Enviando…' : 'Adicionar imagens'}
      </button>
    </section>
  )
}

function QuotesCard({
  identity,
  kit,
  story,
  onChange,
}: {
  identity: IdentityKit
  kit: MarketingKit
  story: StoryData
  onChange: (identity: IdentityKit) => void
}) {
  const quotes = identity.quotes
  const ordered = timeline(story.slots)
  const orderOf = new Map(ordered.map((slot, index) => [slot.id, index + 1]))
  const positions = slotPositions(story.slots)
  const cut = cutPosition(kit, positions)
  const update = (id: string, patch: Partial<IdentityKit['quotes'][number]>) =>
    onChange({ ...identity, quotes: quotes.map((quote) => (quote.id === id ? { ...quote, ...patch } : quote)) })

  return (
    <section className="admin-card mk-card" id="citacoes">
      <h3>Citações</h3>
      <p className="admin-muted">
        Frases do próprio livro para o site: chamadas, legendas, o que cabe num objeto. Só entram no pacote as de cenas
        que o público conhece.
      </p>
      {quotes.length === 0 && <p className="admin-muted">Nenhuma ainda. O rascunho com IA sugere citações conferidas no texto.</p>}
      <ul className="mk-rows">
        {quotes.map((quote) => {
          const order = quote.slotId ? orderOf.get(quote.slotId) : undefined
          const position = quote.slotId ? positions.get(quote.slotId) : null
          const isPublic = order !== undefined && position !== null && position !== undefined && cut !== null && position <= cut
          return (
            <li key={quote.id}>
              <span>
                <span className="mk-field-value">“{quote.text}”</span>
                <span className={isPublic ? 'admin-muted admin-note' : 'form-message admin-note'}>
                  {order ? `Cena ${order}` : 'Cena fora da timeline'}
                  {isPublic ? '' : ' · depois do corte: fica fora do pacote'}
                </span>
              </span>
              <span className="admin-card-actions">
                <select aria-label="Uso da citação" value={quote.use} onChange={(event) => update(quote.id, { use: event.target.value as QuoteUse })}>
                  {quoteUses.map((use) => (
                    <option key={use} value={use}>{quoteUseLabels[use]}</option>
                  ))}
                </select>
                <button className="text-button" type="button" onClick={() => onChange({ ...identity, quotes: quotes.filter((item) => item.id !== quote.id) })}>
                  Remover
                </button>
              </span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
