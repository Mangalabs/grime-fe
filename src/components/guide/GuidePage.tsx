import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import {
  findArticle,
  guideArticles,
  guideCategories,
  type GuideArticle,
} from "../../features/guide/articles";
import type { TourId } from "../../features/tour/tours";
import { normalizeForSearch } from "../../features/scenes/sceneStatus";
import { ChevronRightIcon, SearchIcon } from "../icons";
import "../tour/ProductTour.css";
import "./Guide.css";

export function GuidePage({
  articleId,
  hasOpenProject,
  onOpenArticle,
  onStartTour,
}: {
  articleId: string | null;
  hasOpenProject: boolean;
  onOpenArticle: (id: string | null) => void;
  onStartTour: (tour: TourId) => void;
}) {
  const [query, setQuery] = useState("");
  const article = articleId ? findArticle(articleId) : undefined;
  const articleRef = useRef<HTMLElement>(null);

  const results = useMemo(() => {
    const words = normalizeForSearch(query).split(/\s+/).filter(Boolean);
    if (words.length === 0) return null;
    return guideArticles.filter((candidate) => {
      const haystack = normalizeForSearch(`${candidate.title} ${candidate.summary} ${candidate.keywords}`);
      return words.every((word) => haystack.includes(word));
    });
  }, [query]);

  useEffect(() => {
    if (article) {
      window.scrollTo({ top: 0 });
      articleRef.current?.focus();
    }
  }, [article]);

  // Links inside articles ("#importar") open another article.
  function followArticleLink(event: MouseEvent<HTMLElement>) {
    const link = (event.target as HTMLElement).closest("a");
    const href = link?.getAttribute("href");
    if (href?.startsWith("#") && findArticle(href.slice(1))) {
      event.preventDefault();
      onOpenArticle(href.slice(1));
    }
  }

  const search = (
    <label className="guide-search">
      <SearchIcon />
      <span className="sr-only">Buscar no Guia</span>
      <input
        placeholder="Buscar no Guia: senha, timeline, exceção…"
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
    </label>
  );

  if (article && !results) {
    const position = guideArticles.indexOf(article);
    const next = guideArticles[position + 1];
    return (
      <div className="guide-layout">
        <nav className="guide-nav" aria-label="Artigos do Guia">
          <button className="guide-back" type="button" onClick={() => onOpenArticle(null)}>
            ← Todos os tópicos
          </button>
          {search}
          {guideCategories.map((category) => (
            <div className="guide-nav-group" key={category}>
              <p className="sidebar-section-label">{category}</p>
              <ul>
                {guideArticles
                  .filter((candidate) => candidate.category === category)
                  .map((candidate) => (
                    <li key={candidate.id}>
                      <button
                        aria-current={candidate.id === article.id ? "page" : undefined}
                        type="button"
                        onClick={() => onOpenArticle(candidate.id)}
                      >
                        {candidate.title}
                      </button>
                    </li>
                  ))}
              </ul>
            </div>
          ))}
        </nav>

        <article
          aria-labelledby="guide-article-title"
          className="guide-article"
          ref={articleRef}
          tabIndex={-1}
          onClick={followArticleLink}
        >
          <p className="eyebrow">Guia · {article.category}</p>
          <h1 id="guide-article-title">{article.title}</h1>
          <p className="guide-article-summary">{article.summary}</p>
          <div className="guide-article-body">{article.body}</div>
          {next && (
            <button className="guide-next" type="button" onClick={() => onOpenArticle(next.id)}>
              <span>
                <small>Próximo</small>
                {next.title}
              </span>
              <ChevronRightIcon />
            </button>
          )}
        </article>
      </div>
    );
  }

  return (
    <div className="guide-index">
      <header className="page-intro">
        <p className="eyebrow">Ajuda</p>
        <h1>Guia do Petricor</h1>
        <p>Como cada recurso funciona, do primeiro projeto ao relatório final.</p>
      </header>

      {search}

      {results ? (
        <section aria-label="Resultados da busca" className="guide-results">
          {results.length === 0 ? (
            <p className="empty-state">Nenhum artigo fala disso ainda. Tente outra palavra.</p>
          ) : (
            <ArticleList articles={results} onOpen={(id) => {
              setQuery("");
              onOpenArticle(id);
            }} />
          )}
        </section>
      ) : (
        <>
          <section className="guide-tours" aria-label="Tours guiados">
            <button className="guide-tour-card" type="button" onClick={() => onStartTour("welcome")}>
              <strong>Tour de boas-vindas</strong>
              <span>Onde fica cada coisa: projetos, ferramentas, ajuda e uso.</span>
            </button>
            <button
              className="guide-tour-card"
              disabled={!hasOpenProject}
              title={hasOpenProject ? undefined : "Abra um projeto primeiro"}
              type="button"
              onClick={() => onStartTour("project")}
            >
              <strong>Tour do editor</strong>
              <span>
                {hasOpenProject
                  ? "Da cena escrita à revisão: timeline, análise, cânone e notas."
                  : "Abra um projeto para fazer este tour."}
              </span>
            </button>
          </section>

          {guideCategories.map((category) => (
            <section className="guide-category" key={category} aria-labelledby={`guide-${category}`}>
              <h2 id={`guide-${category}`}>{category}</h2>
              <ArticleList
                articles={guideArticles.filter((candidate) => candidate.category === category)}
                onOpen={onOpenArticle}
              />
            </section>
          ))}
        </>
      )}
    </div>
  );
}

function ArticleList({ articles, onOpen }: { articles: GuideArticle[]; onOpen: (id: string) => void }) {
  return (
    <ul className="guide-article-list">
      {articles.map((article) => (
        <li key={article.id}>
          <button type="button" onClick={() => onOpen(article.id)}>
            <strong>{article.title}</strong>
            <span>{article.summary}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
