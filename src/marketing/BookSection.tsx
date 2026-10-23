import { useEffect, useRef, useState } from 'react'
import {
  bookStatusLabels,
  bookStatuses,
  isWebUrl,
  linkKindLabels,
  linkKinds,
  type BookImage,
  type BookInfo,
  type BookStatus,
  type LinkKind,
} from './bookModel'
import { Field } from './identityParts'
import type { IdentityKit } from './identityModel'
import type { MoodboardImages } from './useMoodboardImages'
import './Identity.css'

/** The book as the landing page sells it: cover, words, author and links. */
export function BookSection({
  projectTitle,
  book,
  identity,
  images,
  onChange,
}: {
  projectTitle: string
  book: BookInfo
  identity: IdentityKit
  images: MoodboardImages
  onChange: (book: BookInfo) => void
}) {
  const set = <K extends keyof BookInfo>(key: K, value: BookInfo[K]) => onChange({ ...book, [key]: value })
  const { ensureLoaded } = images
  useEffect(() => {
    ensureLoaded([book.cover, book.authorPhoto].filter((image): image is BookImage => !!image))
  }, [ensureLoaded, book.cover, book.authorPhoto])

  return (
    <>
      <header className="page-intro admin-intro">
        <p className="eyebrow">Marketing</p>
        <h1>Livro</h1>
        <p>
          O que a página vende: a capa, as palavras que convencem, quem escreveu e onde encontrar. Tudo aqui é escrito
          para o público; cuide para a sinopse não contar mais do que deve.
        </p>
      </header>

      <div className="mk-identity">
        <div className="mk-identity-main">
          <section className="admin-card mk-card">
            <h3>Capa e título</h3>
            <div className="mk-book-cover">
              <ImagePicker
                emptyLabel="Enviar capa"
                image={book.cover}
                images={images}
                label="Capa"
                onChange={(cover) => set('cover', cover)}
              />
              <div className="mk-card">
                <Field label="Título" placeholder={projectTitle} value={book.title} onChange={(title) => set('title', title)} />
                <Field label="Subtítulo" value={book.subtitle} onChange={(subtitle) => set('subtitle', subtitle)} />
                <div className="mk-grid">
                  <Field label="Série" value={book.series} onChange={(series) => set('series', series)} />
                  <Field label="Volume" placeholder="1" value={book.seriesNumber} onChange={(seriesNumber) => set('seriesNumber', seriesNumber)} />
                </div>
                <Field
                  hint="Para leitores de tela e quando a imagem não carrega."
                  label="Descrição da capa"
                  value={book.coverAlt}
                  onChange={(coverAlt) => set('coverAlt', coverAlt)}
                />
              </div>
            </div>
          </section>

          <section className="admin-card mk-card">
            <h3>Palavras que vendem</h3>
            <Field label="Chamada" hint="Uma linha, no topo da página." value={book.tagline} onChange={(tagline) => set('tagline', tagline)} />
            {identity.quotes.length > 0 && (
              <label className="mk-field">
                <span className="mk-label">Ou use uma citação aprovada</span>
                <select value="" onChange={(event) => event.target.value && set('tagline', event.target.value)}>
                  <option value="">Escolher citação…</option>
                  {identity.quotes.map((quote) => (
                    <option key={quote.id} value={quote.text}>
                      {quote.text.length > 90 ? `${quote.text.slice(0, 90)}…` : quote.text}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <Field label="Sinopse curta" hint="Uma ou duas frases, para cartões e prévias de link." multiline value={book.shortBlurb} onChange={(shortBlurb) => set('shortBlurb', shortBlurb)} />
            <label className="mk-field">
              <span className="mk-label">Sinopse</span>
              <span className="admin-muted admin-note">O texto de contracapa.</span>
              <textarea rows={7} value={book.blurb} onChange={(event) => set('blurb', event.target.value)} />
            </label>
          </section>

          <section className="admin-card mk-card">
            <h3>Sobre o livro</h3>
            <div className="mk-grid">
              <Field label="Gênero" placeholder="Fantasia, romance contemporâneo…" value={book.genre} onChange={(genre) => set('genre', genre)} />
              <Field label="Para quem" placeholder="Adulto, jovem adulto, a partir de 14…" value={book.audience} onChange={(audience) => set('audience', audience)} />
              <Field label="Idioma" placeholder="pt-BR" value={book.language} onChange={(language) => set('language', language)} />
              <label className="mk-field">
                <span className="mk-label">Lançamento</span>
                <input type="date" value={book.releaseDate} onChange={(event) => set('releaseDate', event.target.value)} />
              </label>
              <label className="mk-field">
                <span className="mk-label">Situação</span>
                <select value={book.status ?? ''} onChange={(event) => set('status', (event.target.value || null) as BookStatus | null)}>
                  <option value="">—</option>
                  {bookStatuses.map((status) => (
                    <option key={status} value={status}>{bookStatusLabels[status]}</option>
                  ))}
                </select>
              </label>
            </div>
          </section>

          <LinksCard book={book} onChange={onChange} />

          <section className="admin-card mk-card">
            <h3>Autor</h3>
            <div className="mk-book-cover">
              <ImagePicker
                emptyLabel="Enviar foto"
                image={book.authorPhoto}
                images={images}
                label="Foto do autor"
                onChange={(authorPhoto) => set('authorPhoto', authorPhoto)}
              />
              <div className="mk-card">
                <Field label="Nome" value={book.authorName} onChange={(authorName) => set('authorName', authorName)} />
                <Field label="Bio" multiline value={book.authorBio} onChange={(authorBio) => set('authorBio', authorBio)} />
              </div>
            </div>
          </section>
        </div>

        <aside className="mk-identity-aside">
          <BookPreview book={book} imageUrl={book.cover ? (images.urls[book.cover.assetId] ?? null) : null} projectTitle={projectTitle} />
        </aside>
      </div>
    </>
  )
}

function LinksCard({ book, onChange }: { book: BookInfo; onChange: (book: BookInfo) => void }) {
  const links = book.links
  const update = (id: string, patch: Partial<BookInfo['links'][number]>) =>
    onChange({ ...book, links: links.map((link) => (link.id === id ? { ...link, ...patch } : link)) })
  return (
    <section className="admin-card mk-card">
      <h3>Onde encontrar</h3>
      <p className="admin-muted">Lojas, pré-venda, amostra, newsletter. Marque a chamada principal: o botão para o qual o site inteiro leva.</p>
      {links.map((link) => {
        const isInvalid = link.url.trim() !== '' && !isWebUrl(link.url)
        return (
          <div className="mk-row-card" key={link.id}>
            <div className="mk-grid">
              <label className="mk-field">
                <span className="mk-label">Tipo</span>
                <select value={link.kind} onChange={(event) => update(link.id, { kind: event.target.value as LinkKind })}>
                  {linkKinds.map((kind) => (
                    <option key={kind} value={kind}>{linkKindLabels[kind]}</option>
                  ))}
                </select>
              </label>
              <Field label="Texto do botão" placeholder={linkKindLabels[link.kind]} value={link.label} onChange={(label) => update(link.id, { label })} />
            </div>
            <label className="mk-field">
              <span className="mk-label">Endereço</span>
              <input aria-invalid={isInvalid || undefined} inputMode="url" placeholder="https://" value={link.url} onChange={(event) => update(link.id, { url: event.target.value })} />
              {isInvalid && <span className="form-message">Use um endereço que comece com https://. Este fica fora do pacote.</span>}
            </label>
            <div className="mk-row-foot">
              <label className="mk-radio">
                <input checked={book.primaryLinkId === link.id} name="mk-primary-link" type="radio" onChange={() => onChange({ ...book, primaryLinkId: link.id })} />
                <span>Chamada principal</span>
              </label>
              <button
                className="text-button"
                type="button"
                onClick={() =>
                  onChange({
                    ...book,
                    links: links.filter((item) => item.id !== link.id),
                    primaryLinkId: book.primaryLinkId === link.id ? null : book.primaryLinkId,
                  })
                }
              >
                Remover
              </button>
            </div>
          </div>
        )
      })}
      <button
        className="button button-secondary button-small"
        type="button"
        onClick={() => {
          const link = { id: crypto.randomUUID(), kind: links.length ? ('OTHER' as const) : ('PREORDER' as const), label: '', url: '' }
          onChange({ ...book, links: [...links, link], primaryLinkId: book.primaryLinkId ?? link.id })
        }}
      >
        Adicionar link
      </button>
    </section>
  )
}

function ImagePicker({
  label,
  emptyLabel,
  image,
  images,
  onChange,
}: {
  label: string
  emptyLabel: string
  image: BookImage | null
  images: MoodboardImages
  onChange: (image: BookImage | null) => void
}) {
  const input = useRef<HTMLInputElement>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState('')
  const url = image ? images.urls[image.assetId] : undefined

  async function pick(file: File | undefined) {
    if (!file) return
    setIsUploading(true)
    setError('')
    try {
      onChange(await images.upload(file))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível enviar a imagem.')
    } finally {
      setIsUploading(false)
      if (input.current) input.current.value = ''
    }
  }

  return (
    <div className="mk-image-picker">
      <span className="mk-label">{label}</span>
      <button className="mk-image-slot" disabled={isUploading} type="button" onClick={() => input.current?.click()}>
        {url ? <img alt={label} src={url} /> : <span>{isUploading ? 'Enviando…' : image ? 'Abrindo…' : emptyLabel}</span>}
      </button>
      {image && (
        <button className="text-button" type="button" onClick={() => onChange(null)}>
          Remover
        </button>
      )}
      {error && <span className="form-message">{error}</span>}
      <input accept="image/*" hidden ref={input} type="file" onChange={(event) => void pick(event.target.files?.[0])} />
    </div>
  )
}

function BookPreview({ book, projectTitle, imageUrl }: { book: BookInfo; projectTitle: string; imageUrl: string | null }) {
  const primary = book.links.find((link) => link.id === book.primaryLinkId)
  return (
    <figure className="mk-book-preview">
      <div className="mk-book-preview-cover">{imageUrl ? <img alt={book.coverAlt} src={imageUrl} /> : <span>Capa</span>}</div>
      <figcaption>
        {book.tagline && <p className="mk-draft-quote">{book.tagline}</p>}
        <strong>{book.title || projectTitle}</strong>
        {book.subtitle && <span className="admin-muted">{book.subtitle}</span>}
        {book.authorName && <span>{book.authorName}</span>}
        {book.shortBlurb && <p>{book.shortBlurb}</p>}
        <span className="admin-muted">
          {[book.status ? bookStatusLabels[book.status] : '', book.releaseDate ? new Date(`${book.releaseDate}T12:00:00`).toLocaleDateString('pt-BR') : '']
            .filter(Boolean)
            .join(' · ')}
        </span>
        {primary && <span className="button button-primary button-small">{primary.label || linkKindLabels[primary.kind]}</span>}
      </figcaption>
    </figure>
  )
}
