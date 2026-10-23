import type { TourStep } from "../../components/tour/ProductTour";

export type TourId = "welcome" | "project";

// The first visit: where things are, before there is a project to show.
export const welcomeTour: TourStep[] = [
  {
    title: "Boas-vindas ao Petricor",
    body: (
      <>
        <p>Em um minuto, mostramos onde fica cada coisa.</p>
        <p>
          O Petricor lê suas cenas, aponta o que não se sustenta e guarda o cânone da sua obra, sem reescrever
          uma linha.
        </p>
      </>
    ),
  },
  {
    target: "project-switcher",
    inSidebar: true,
    title: "Seus projetos",
    body: (
      <p>
        Cada livro é um projeto. Crie ou abra um aqui. O texto de cada projeto é cifrado no seu navegador com uma
        senha só dele.
      </p>
    ),
    learnMore: "primeiros-passos",
  },
  {
    target: "sidebar-nav",
    inSidebar: true,
    title: "As ferramentas",
    body: (
      <p>
        Escrever, analisar e entregar: o editor e a timeline, o Arquivo com o cânone, a folha de estilo, a revisão
        arquitetural, o ritmo e a exportação. Elas se abrem quando um projeto está aberto.
      </p>
    ),
  },
  {
    target: "help",
    title: "Ajuda a um clique",
    body: <p>O Guia explica cada recurso em detalhe. Por aqui você também refaz este tour quando quiser.</p>,
  },
  {
    target: "account",
    title: "Seu limite mensal",
    body: (
      <p>
        Cada análise lê as palavras do seu texto e usa parte do seu limite do mês. O uso de cada recurso fica no
        menu da conta.
      </p>
    ),
    learnMore: "uso-mensal",
  },
  {
    title: "Tudo pronto",
    body: <p>Comece por um projeto. Quando você abri-lo, mostramos o editor e a análise.</p>,
  },
];

// The first time a project is open: how a scene goes from text to review.
export const projectTour: TourStep[] = [
  {
    target: "timeline",
    title: "A timeline",
    body: (
      <>
        <p>Cada faixa é uma cena, na ordem da história. A cor diz o que ela pede:</p>
        <p>
          vermelho, um diagnóstico crítico; âmbar, revalidar depois de uma mudança no cânone; azul, fatos esperando
          sua decisão; verde, analisada.
        </p>
      </>
    ),
    learnMore: "cenas-e-timeline",
  },
  {
    target: "new-scene",
    title: "Nova cena",
    body: (
      <p>
        Crie cenas aqui ou com <kbd>Alt</kbd> <kbd>N</kbd>. Para ir a qualquer cena pelo número ou pelo título,
        use <kbd>Ctrl</kbd> <kbd>K</kbd>.
      </p>
    ),
  },
  {
    target: "editor",
    title: "O editor",
    body: (
      <p>
        Escreva ou cole o texto da cena, dê um título e escolha o foco da revisão. O texto é cifrado antes de sair
        do navegador.
      </p>
    ),
  },
  {
    target: "analyze",
    title: "Salvar e analisar",
    body: (
      <p>
        O Revisor aponta problemas e o Arquivista propõe fatos para o cânone. Uma cena de 1.000 palavras usa 2.000
        do seu limite mensal: os dois leem a cena inteira.
      </p>
    ),
    learnMore: "revisor",
  },
  {
    target: "revisor",
    title: "O Revisor",
    body: (
      <p>
        Cada diagnóstico traz o trecho exato e uma orientação. Clique no trecho para achá-lo no texto, registre uma
        exceção intencional ou exclua o que não se aplica.
      </p>
    ),
    learnMore: "revisor",
  },
  {
    target: "archivist",
    title: "O Arquivista",
    body: <p>Os fatos que ele encontra na cena esperam aqui. Nada entra no cânone sem a sua aprovação.</p>,
    learnMore: "arquivista",
  },
  {
    target: "notes",
    title: "Notas de revisão",
    body: (
      <p>
        Anote perguntas, ideias e correções sobre a cena ou um trecho dela. Atalho: <kbd>Alt</kbd> <kbd>A</kbd>.
      </p>
    ),
    learnMore: "notas",
  },
  {
    title: "Pronto para escrever",
    body: <p>Tudo isto está no Guia, em detalhe, com os atalhos de teclado. Ele fica no menu de ajuda.</p>,
  },
];
