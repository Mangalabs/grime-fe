import type { ReactNode } from "react";
import { Keys } from "../../components/guide/Keys";

export type GuideCategory = "Começando" | "Escrever" | "Analisar" | "Entregar" | "Sua conta";

export type GuideArticle = {
  id: string;
  category: GuideCategory;
  title: string;
  summary: string;
  // Extra words people search with that the title doesn't contain.
  keywords: string;
  body: ReactNode;
};

export const guideCategories: GuideCategory[] = ["Começando", "Escrever", "Analisar", "Entregar", "Sua conta"];

export const guideArticles: GuideArticle[] = [
  {
    id: "primeiros-passos",
    category: "Começando",
    title: "Primeiros passos",
    summary: "Crie um projeto, escreva a primeira cena e faça a primeira análise.",
    keywords: "começar criar projeto senha chave recuperação nova cena início",
    body: (
      <>
        <p>
          No Petricor, cada livro é um <strong>projeto</strong>. Um projeto reúne as cenas, o cânone (os fatos da
          obra), as notas e os relatórios.
        </p>
        <h3>1. Crie o projeto</h3>
        <ol>
          <li>
            Na barra lateral, abra o seletor de projeto e escolha <strong>Novo projeto</strong>.
          </li>
          <li>
            Gere a <strong>chave privada de recuperação</strong>, copie-a e guarde-a em um lugar seguro.
          </li>
          <li>Dê um título ao projeto e escolha uma senha para ele.</li>
        </ol>
        <p className="guide-callout">
          A senha do projeto é diferente da senha da sua conta. É com ela que o texto é cifrado no seu navegador;
          sem ela, ninguém consegue ler suas cenas, nem a equipe do Petricor. Se esquecer a senha, a chave de
          recuperação cria uma nova: veja <a href="#recuperar-acesso">Recuperar o acesso a um projeto</a>.
        </p>
        <h3>2. Escreva a primeira cena</h3>
        <p>
          Com o projeto aberto, use <strong>Nova cena</strong> (ou <Keys keys={["Alt", "N"]} />). Dê um título,
          escreva ou cole o texto e escolha o foco da revisão: revisão geral, ritmo e causalidade, mundo e
          continuidade ou estilo de prosa.
        </p>
        <h3>3. Analise</h3>
        <p>
          <strong>Salvar e analisar</strong> cifra e guarda o texto e o envia para análise. Em instantes, o Revisor
          mostra os diagnósticos e o Arquivista propõe os fatos que encontrou. Você decide o que entra no cânone.
        </p>
        <p>
          Já tem o livro pronto? Em vez de criar cena por cena, <a href="#importar">importe o manuscrito</a> em PDF ou Word.
        </p>
      </>
    ),
  },
  {
    id: "privacidade",
    category: "Começando",
    title: "Privacidade e criptografia",
    summary: "O que fica cifrado, o que o servidor vê e por que cada projeto tem uma senha.",
    keywords: "segurança senha cifrado criptografia servidor dados chave recuperação",
    body: (
      <>
        <p>
          O texto das cenas, as notas e a folha de estilo são cifrados <strong>no seu navegador</strong>, com uma
          chave que só a senha do projeto abre. O servidor guarda apenas o texto cifrado.
        </p>
        <h3>O que o servidor vê</h3>
        <ul>
          <li>
            <strong>Durante uma análise</strong>, o texto da cena é decifrado no navegador e enviado ao serviço de
            análise. Ele não é guardado em texto aberto.
          </li>
          <li>
            Para que a análise funcione, ficam no servidor <strong>os diagnósticos</strong> (com o trecho citado) e{" "}
            <strong>o cânone</strong>: personagens, lugares e fatos aprovados por você.
          </li>
          <li>
            <strong>Ao importar um PDF ou um arquivo do Word</strong>, o arquivo é lido no servidor para encontrar
            as cenas. Depois que você salva a importação, as cenas são cifradas no navegador e o arquivo é
            descartado.
          </li>
          <li>
            <strong>Ao sincronizar com o Google Docs</strong>, o servidor lê o documento e o entrega ao seu
            navegador, que cifra as cenas. O texto não é guardado no servidor. A autorização da sua conta Google
            fica guardada cifrada, e você pode removê-la quando quiser.
          </li>
          <li>
            <strong>Ao publicar comentários no Google Docs</strong>, os diagnósticos e as notas escolhidos vão para
            o documento, onde ficam fora da criptografia do Petricor e visíveis para quem acessa o documento.
          </li>
        </ul>
        <h3>Senha do projeto e chave de recuperação</h3>
        <p>
          Cada projeto tem uma senha própria, pedida sempre que você o abre. A chave de recuperação, criada com o
          projeto, é a cópia de segurança dessa proteção: com ela, você{" "}
          <a href="#recuperar-acesso">cria uma nova senha</a> se esquecer a atual. Guarde-a fora do Petricor. Sem
          a senha e sem a chave, ninguém consegue decifrar o texto.
        </p>
      </>
    ),
  },
  {
    id: "recuperar-acesso",
    category: "Começando",
    title: "Recuperar o acesso a um projeto",
    summary: "Esqueceu a senha do projeto? Crie uma nova com a chave de recuperação.",
    keywords: "esqueci senha perdi recuperar recuperação chave redefinir trocar nova senha bloqueado",
    body: (
      <>
        <p>
          Se você esqueceu a senha de um projeto, a <strong>chave privada de recuperação</strong>, gerada quando o
          projeto foi criado, permite criar uma nova.
        </p>
        <ol>
          <li>Escolha o projeto no seletor da barra lateral.</li>
          <li>
            Na janela da senha, clique em <strong>Esqueci a senha do projeto</strong>.
          </li>
          <li>Cole a chave de recuperação inteira e escolha a nova senha.</li>
          <li>
            Clique em <strong>Redefinir senha</strong>. O projeto abre com a nova senha.
          </li>
        </ol>
        <h3>O que muda</h3>
        <ul>
          <li>
            A <strong>nova senha</strong> passa a valer para abrir e para excluir o projeto. A antiga deixa de
            funcionar.
          </li>
          <li>
            A <strong>chave de recuperação continua a mesma</strong>: guarde-a no mesmo lugar seguro de antes.
          </li>
          <li>Nada do projeto se perde: cenas, notas e cânone continuam como estavam.</li>
        </ul>
        <p className="guide-callout">
          A troca acontece no seu navegador: a chave do projeto é protegida de novo com a nova senha antes de ser
          enviada. A chave de recuperação vai ao servidor só para provar que você pode trocar a senha, e não é
          guardada.
        </p>
        <h3>Se você perdeu a senha e a chave</h3>
        <p>
          Então não há como abrir o projeto: o texto está cifrado e ninguém tem a chave, nem a equipe do Petricor.
          É por isso que vale guardar a chave de recuperação fora do Petricor, em um gerenciador de senhas ou em
          papel.
        </p>
      </>
    ),
  },
  {
    id: "cenas-e-timeline",
    category: "Escrever",
    title: "Cenas e timeline",
    summary: "Ordem da história, cenas avulsas, cores de estado, grupos e como desfazer movimentos.",
    keywords: "ordem mover reordenar avulsa grupos estrutura atos jornada cores estado dividir juntar desfazer",
    body: (
      <>
        <p>
          A <strong>timeline</strong> mostra as cenas na ordem da história, cada uma como uma faixa. Clique em uma
          faixa para abrir a cena.
        </p>
        <h3>O que as cores dizem</h3>
        <ul className="guide-states">
          <li>
            <span className="state-swatch state-critical" /> <strong>Diagnóstico crítico</strong>: algo contradiz o
            cânone.
          </li>
          <li>
            <span className="state-swatch state-alert" /> <strong>Precisa revalidar</strong>: o cânone mudou depois
            que a cena foi analisada.
          </li>
          <li>
            <span className="state-swatch state-facts" /> <strong>Fatos aguardando decisão</strong>: o Arquivista
            propôs fatos que você ainda não aprovou.
          </li>
          <li>
            <span className="state-swatch state-clean" /> <strong>Analisada</strong>: nada pendente.
          </li>
          <li>
            <span className="state-swatch state-unanalyzed" /> <strong>Não analisada</strong>.
          </li>
        </ul>
        <h3>Encontrar e mover cenas</h3>
        <p>
          <Keys keys={["Ctrl", "K"]} /> abre a busca de cenas, pelo número ou por palavras do título. Na busca,{" "}
          <Keys keys={["Alt", "↑"]} /> e <Keys keys={["Alt", "↓"]} /> movem a cena destacada na timeline. Use{" "}
          <Keys keys={["["]} /> e <Keys keys={["]"]} /> para ir à cena anterior e à próxima.
        </p>
        <p>
          Movimentos podem ser desfeitos: pelo aviso que aparece logo depois (ou com <Keys keys={["Ctrl", "Z"]} />,
          enquanto ele estiver na tela) e, a qualquer momento, pelo histórico de movimentos da timeline.
        </p>
        <h3>Cenas avulsas</h3>
        <p>
          Uma cena marcada como <strong>avulsa</strong> fica fora da timeline: um rascunho, uma cena sem lugar
          definido. Na busca, <Keys keys={["Alt", "Enter"]} /> coloca uma cena avulsa no fim da timeline.
        </p>
        <h3>Dividir e juntar</h3>
        <p>
          No menu <strong>Mais ações</strong> da cena, <strong>Dividir cena</strong> (<Keys keys={["Alt", "X"]} />)
          corta a cena onde você escolher, e <strong>Juntar com a próxima</strong> (<Keys keys={["Alt", "J"]} />)
          une as duas. Notas e diagnósticos acompanham o trecho a que se referem.
        </p>
        <h3>Estrutura</h3>
        <p>
          Em <strong>Estrutura</strong>, agrupe cenas em atos ou etapas, do zero ou a partir de um modelo: jornada do
          herói, três atos ou Save the Cat. Os grupos aparecem como faixas coloridas sobre a timeline.
        </p>
      </>
    ),
  },
  {
    id: "notas",
    category: "Escrever",
    title: "Notas de revisão",
    summary: "Anote perguntas, ideias e correções sobre a cena, um trecho ou o projeto.",
    keywords: "anotação comentário pergunta ideia corrigir resolver trecho",
    body: (
      <>
        <p>
          As notas são o seu caderno de revisão. Abra o painel pelo botão <strong>Notas</strong> ou com{" "}
          <Keys keys={["Alt", "A"]} />.
        </p>
        <ul>
          <li>
            Uma nota pode ser sobre <strong>o projeto</strong>, sobre <strong>a cena</strong> ou sobre{" "}
            <strong>um trecho</strong>: selecione o trecho no texto antes de abrir o painel.
          </li>
          <li>
            Cada nota tem um tipo: <strong>Nota</strong>, <strong>Pergunta</strong>, <strong>Corrigir</strong> ou{" "}
            <strong>Ideia</strong>.
          </li>
          <li>Marque como resolvida o que já foi tratado; as abertas aparecem no contador do botão.</li>
        </ul>
        <p>As notas são cifradas como o texto das cenas.</p>
      </>
    ),
  },
  {
    id: "importar",
    category: "Escrever",
    title: "Importar um manuscrito",
    summary: "Transforme um PDF ou um arquivo do Word em cenas do projeto.",
    keywords: "pdf word docx importar arquivo livro manuscrito cenas automático títulos",
    body: (
      <>
        <p>
          Em <strong>Importar manuscrito</strong>, envie o livro em PDF ou em Word (.docx), com até 25 MB. Arquivos
          .doc antigos precisam antes ser salvos como .docx no Word.
        </p>
        <ol>
          <li>Escolha o arquivo e confirme que as cenas atuais do projeto serão substituídas.</li>
          <li>
            A leitura acontece no servidor e pode levar alguns minutos. Você pode fechar a janela e voltar depois.
          </li>
          <li>
            Quando as cenas estiverem prontas, salve: elas são cifradas no seu navegador e o arquivo é descartado.
          </li>
        </ol>
        <h3>Como as cenas são encontradas</h3>
        <p>
          Num <strong>PDF</strong>, o Importador lê o texto e encontra onde cada cena começa.
        </p>
        <p>
          Num <strong>arquivo do Word</strong>, você escolhe. Se cada cena começa com um título (os estilos Título
          1, Título 2 ou Título 3 do Word), escolha esse nível: cada título vira uma cena com esse nome, na hora.
          Títulos de nível acima, como o de uma parte ou capítulo, ficam de fora do texto. O texto antes do primeiro
          título vira uma cena de abertura. Se o documento não tem esses títulos, deixe o Importador encontrar as
          cenas, como num PDF.
        </p>
        <p className="guide-callout">
          Quando o Importador lê o texto, a importação usa do seu limite mensal tantas palavras quanto o arquivo tem.
          Dividir um arquivo do Word pelos títulos não usa palavras. Veja <a href="#uso-mensal">Uso mensal</a>.
        </p>
      </>
    ),
  },
  {
    id: "google-docs",
    category: "Escrever",
    title: "Sincronizar com o Google Docs",
    summary: "Escreva no Google Docs e revise no Petricor: os títulos do documento viram cenas.",
    keywords: "google docs drive documento sincronizar importar integração conectar atualizar títulos comentários publicar",
    body: (
      <>
        <p>
          Se você escreve no Google Docs, vincule o documento ao projeto. Cada título do documento vira uma cena, e
          as mudanças chegam ao Petricor sozinhas.
        </p>
        <h3>1. Conecte sua conta Google</h3>
        <p>
          Em <strong>Google Docs</strong>, na barra lateral, clique em <strong>Conectar conta Google</strong> e
          autorize na janela do Google. O Petricor pede só permissão de <strong>leitura</strong>: nunca altera nada
          nos seus documentos.
        </p>
        <h3>2. Vincule o documento</h3>
        <p>
          Cole o link do documento e escolha em que nível de título cada cena começa: <strong>Título 1</strong>,{" "}
          <strong>Título 2</strong> ou <strong>Título 3</strong> (os estilos de título do Google Docs). O texto até
          o próximo título do mesmo nível é a cena; títulos menores ficam dentro dela. Texto antes do primeiro título
          vira uma cena de abertura.
        </p>
        <p>As cenas entram na timeline na ordem do documento.</p>
        <h3>Quando sincroniza</h3>
        <ul>
          <li>Ao abrir o projeto e a cada 10 minutos enquanto ele está aberto.</li>
          <li>
            Quando você clica em <strong>Sincronizar agora</strong>.
          </li>
        </ul>
        <p>
          Com o projeto fechado, nada é atualizado: o texto só pode ser cifrado com a senha do projeto, no seu
          navegador.
        </p>
        <h3>O que acontece em cada sincronização</h3>
        <ul>
          <li>
            Cenas cujo texto mudou no documento são atualizadas e voltam a <strong>não analisada</strong>, prontas
            para <strong>Analisar pendentes</strong>.
          </li>
          <li>Títulos novos viram cenas novas, no lugar certo da timeline. Renomear um título só renomeia a cena.</li>
          <li>
            Uma cena cujo título saiu do documento <strong>continua no projeto</strong>, com notas e análises; ela só
            deixa de ser atualizada.
          </li>
          <li>A sincronização não usa seu limite mensal de palavras; as análises depois, sim.</li>
        </ul>
        <p className="guide-callout">
          O documento manda: se você editar aqui o texto de uma cena vinculada, a versão do Google Docs a substitui
          na próxima sincronização. Faça as mudanças no documento.
        </p>
        <h3>Comentários no documento</h3>
        <p>
          Você também pode levar a revisão de volta ao Google Docs: em <strong>Comentários no documento</strong>,
          escolha o que publicar e clique em <strong>Publicar no documento</strong>. Cada item vira um comentário no
          trecho de que fala:
        </p>
        <ul>
          <li>os diagnósticos do Revisor (as exceções intencionais ficam de fora);</li>
          <li>as ocorrências da folha de estilo;</li>
          <li>os achados da revisão arquitetural mais recente;</li>
          <li>suas notas de revisão abertas.</li>
        </ul>
        <p>
          Quando o trecho não está mais no documento, o comentário vai para o título da cena. Todos começam com
          “Petricor”, para você distinguir dos seus.
        </p>
        <p>
          Publicar de novo atualiza o que mudou e <strong>resolve</strong> no documento o que já não se aplica (um
          diagnóstico corrigido ou excluído, uma nota resolvida). Comentários que você apagar ou resolver no Google
          Docs ficam como estão: o Petricor não os publica outra vez.
        </p>
        <p className="guide-callout">
          Para comentar, o Google pede uma permissão a mais, que ele descreve como “ver e editar seus documentos”. O
          Petricor só a usa para escrever comentários. As notas publicadas passam a ficar no Google Docs, fora da
          criptografia do Petricor, visíveis para quem tiver acesso ao documento.
        </p>
        <h3>Desvincular e desconectar</h3>
        <p>
          <strong>Desvincular documento</strong> mantém as cenas no projeto e para de atualizá-las.{" "}
          <strong>Desconectar</strong> remove o acesso do Petricor à sua conta Google, também no lado do Google.
        </p>
      </>
    ),
  },
  {
    id: "revisor",
    category: "Analisar",
    title: "O Revisor e os diagnósticos",
    summary: "Gravidades, categorias, exceções intencionais e como excluir um diagnóstico.",
    keywords: "diagnóstico análise crítico atenção nota exceção intencional excluir foco revisão analisar pendentes",
    body: (
      <>
        <p>
          O Revisor lê a cena contra o cânone e aponta o que não se sustenta. Ele <strong>descreve</strong>{" "}
          problemas; nunca reescreve o texto.
        </p>
        <h3>Gravidade</h3>
        <ul>
          <li>
            <strong>Crítico</strong>: uma contradição com o cânone sem explicação possível.
          </li>
          <li>
            <strong>Atenção</strong>: algo provavelmente errado, com dúvida razoável.
          </li>
          <li>
            <strong>Nota</strong>: uma observação de ritmo, estilo ou prosa.
          </li>
        </ul>
        <p>
          Cada diagnóstico mostra o trecho que o originou; clique nele para encontrá-lo no texto. Os filtros do
          painel separam por gravidade e por categoria.
        </p>
        <h3>Quando o diagnóstico não se aplica</h3>
        <ul>
          <li>
            <strong>Marcar como exceção intencional</strong>: o efeito é proposital (um narrador que mente, uma
            pista falsa). Registre o motivo; a cena deixa de ficar vermelha e a exceção pode ser desfeita depois.
          </li>
          <li>
            <strong>Excluir</strong>: o diagnóstico está errado. Ele sai da lista e não volta quando o mesmo trecho
            for analisado de novo.
          </li>
        </ul>
        <p>
          Corrigiu o texto? Analise a cena de novo: os diagnósticos que não se aplicam mais desaparecem sozinhos.
        </p>
        <h3>Analisar várias cenas</h3>
        <p>
          <strong>Analisar pendentes</strong>, na timeline, analisa em segundo plano as cenas que ainda não foram
          analisadas, ou todas de novo. Mantenha a aba aberta enquanto isso.
        </p>
      </>
    ),
  },
  {
    id: "arquivista",
    category: "Analisar",
    title: "O Arquivista e o cânone",
    summary: "Fatos propostos, aprovação e o Arquivo: entidades, fatos e relações.",
    keywords: "cânone fatos aprovar rejeitar entidades personagens lugares relações mesclar arquivo alertas revalidar",
    body: (
      <>
        <p>
          A cada análise, o <strong>Arquivista</strong> extrai da cena os fatos da obra: quem está onde, o que cada
          personagem tem, o que aconteceu. Eles chegam como uma <strong>proposta</strong>.
        </p>
        <h3>Aprovar a proposta</h3>
        <p>
          Revise cada fato: edite, remova o que não serve e aprove. Só os fatos aprovados entram no cânone, que é
          a referência do Revisor para as próximas cenas. Rejeitar descarta a proposta inteira.
        </p>
        <h3>Quando o cânone muda</h3>
        <p>
          Aprovar fatos novos pode afetar cenas que vêm depois. Elas ficam em âmbar, como{" "}
          <strong>Precisa revalidar</strong>, e o painel de alertas da cena diz qual cena mudou o cânone.
        </p>
        <h3>O Arquivo</h3>
        <p>O Arquivo reúne o cânone do projeto em três vistas:</p>
        <ul>
          <li>
            <strong>Entidades</strong>: personagens, lugares, itens, facções. Junte nomes que são a mesma entidade
            (apelidos) ou separe o que foi juntado por engano.
          </li>
          <li>
            <strong>Fatos</strong>: tudo o que foi aprovado, com a cena de origem.
          </li>
          <li>
            <strong>Relações</strong>: quem se liga a quem, em lista ou em mapa.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "folha-de-estilo",
    category: "Analisar",
    title: "Folha de estilo",
    summary: "Grafias, vocabulário e tipografia do projeto, verificados em todas as cenas.",
    keywords: "estilo grafia ortografia palavras evitar tipografia convenções",
    body: (
      <>
        <p>
          A <strong>folha de estilo</strong> guarda as convenções do projeto: como se escreve cada nome, palavras a
          evitar, regras de tipografia.
        </p>
        <p>
          As ocorrências aparecem na aba <strong>Estilo</strong> do Revisor, ao lado da análise, e são verificadas
          neste navegador. A folha nunca altera o texto.
        </p>
      </>
    ),
  },
  {
    id: "revisao-arquitetural",
    category: "Analisar",
    title: "Revisão arquitetural e ritmo",
    summary: "O diagnóstico da obra inteira: estrutura, tramas, arcos e a curva de tensão.",
    keywords: "arquiteto estrutura obra manuscrito ritmo tensão curva tramas arcos clímax",
    body: (
      <>
        <p>
          A <strong>revisão arquitetural</strong> lê o manuscrito inteiro, as cenas da timeline em ordem, e descreve
          sintomas estruturais: ritmo arrastado, tramas abandonadas, arcos que não se movem, clímax sem ressonância.
        </p>
        <p>
          Informe o gênero e, se quiser, a estrutura narrativa; em branco, o Arquiteto identifica a estrutura. Cada
          relatório fica salvo no projeto.
        </p>
        <h3>Ritmo e tensão</h3>
        <p>
          A página <strong>Ritmo e tensão</strong> mostra como a obra se move, cena a cena: extensão, diálogo,
          frases e elenco, medidos neste navegador. A curva de tensão vem da revisão arquitetural mais recente.
        </p>
        <p className="guide-callout">
          Cada revisão usa do seu limite mensal tantas palavras quanto as cenas somam.
        </p>
      </>
    ),
  },
  {
    id: "exportar",
    category: "Entregar",
    title: "Exportar revisões",
    summary: "Relatório para o autor, checklist de revisão ou manuscrito anotado, em PDF ou Word.",
    keywords: "pdf word docx exportar relatório checklist manuscrito anotado comentários imprimir enviar",
    body: (
      <>
        <p>Em Exportar revisões, escolha para quem é o documento:</p>
        <ul>
          <li>
            <strong>Relatório para o autor</strong>: resumo, prioridades, revisão estrutural e, por cena, só o que
            pede atenção.
          </li>
          <li>
            <strong>Checklist de revisão</strong>: uma linha por pendência, com caixa de seleção, na ordem da
            timeline.
          </li>
          <li>
            <strong>Manuscrito anotado</strong>: o texto das cenas com as observações, em PDF ou em Word.
          </li>
        </ul>
        <h3>Manuscrito anotado no Word</h3>
        <p>
          Escolha o formato <strong>Word (.docx)</strong> para revisar o texto no Word. Cada diagnóstico e cada
          nota vira um <strong>comentário do Word</strong> no trecho de que fala, assinado com o nome em{" "}
          <strong>Autor dos comentários</strong>. O que não aponta para um trecho fica no título da cena. Marque{" "}
          <strong>Ocorrências da folha de estilo</strong> para receber também um comentário em cada palavra fora
          da folha de estilo.
        </p>
        <p>
          Cada cena começa com um Título 1 com o nome dela. Assim, depois de editar o texto no Word, você pode{" "}
          <a href="#importar">importar o arquivo de volta</a> dividindo as cenas por Título 1. Os comentários não
          voltam com ele.
        </p>
        <p>O documento é montado neste navegador: o texto não sai daqui.</p>
      </>
    ),
  },
  {
    id: "uso-mensal",
    category: "Sua conta",
    title: "Uso mensal",
    summary: "Como as palavras do seu limite são contadas e quando o limite renova.",
    keywords: "limite palavras uso plano consumo mensal renovar esgotado",
    body: (
      <>
        <p>
          Sua conta tem um limite de palavras por mês. Cada recurso conta as palavras <strong>do seu texto</strong>{" "}
          que lê:
        </p>
        <ul>
          <li>
            <strong>Revisor</strong>: as palavras da cena analisada.
          </li>
          <li>
            <strong>Arquivista</strong>: as mesmas palavras, porque ele também lê a cena inteira.
          </li>
          <li>
            <strong>Arquiteto</strong>: as palavras do manuscrito inteiro, a cada revisão arquitetural.
          </li>
          <li>
            <strong>Importador</strong>: as palavras do arquivo importado, quando ele lê o texto para encontrar as
            cenas. Um arquivo do Word dividido pelos títulos não conta.
          </li>
        </ul>
        <p>
          Assim, analisar uma cena de 1.000 palavras usa 2.000. Se uma análise falha, as palavras voltam para o seu
          limite.
        </p>
        <p>
          O limite renova no dia 1º de cada mês. O uso atual, por recurso, fica no menu da conta, no canto superior
          direito. Quando faltar limite, a ação diz quantas palavras precisa e quantas restam.
        </p>
      </>
    ),
  },
  {
    id: "atalhos",
    category: "Sua conta",
    title: "Atalhos de teclado",
    summary: "Navegue e trabalhe sem tirar as mãos do teclado.",
    keywords: "atalhos teclado tecla ctrl alt",
    body: (
      <>
        <table className="guide-shortcuts">
          <tbody>
            <tr>
              <td><Keys keys={["Ctrl", "K"]} /></td>
              <td>Encontrar uma cena</td>
            </tr>
            <tr>
              <td><Keys keys={["Alt", "N"]} /></td>
              <td>Nova cena</td>
            </tr>
            <tr>
              <td><Keys keys={["Alt", "A"]} /></td>
              <td>Notas de revisão</td>
            </tr>
            <tr>
              <td><Keys keys={["["]} /> <Keys keys={["]"]} /></td>
              <td>Cena anterior e próxima</td>
            </tr>
            <tr>
              <td><Keys keys={["Alt", "X"]} /></td>
              <td>Dividir a cena</td>
            </tr>
            <tr>
              <td><Keys keys={["Alt", "J"]} /></td>
              <td>Juntar com a próxima cena</td>
            </tr>
            <tr>
              <td><Keys keys={["Ctrl", "Z"]} /></td>
              <td>Desfazer o movimento que o aviso oferece (fora de campos de texto)</td>
            </tr>
            <tr>
              <td><Keys keys={["Alt", "↑"]} /> <Keys keys={["Alt", "↓"]} /></td>
              <td>Na busca de cenas: mover a cena destacada</td>
            </tr>
          </tbody>
        </table>
        <p>No Mac, use <kbd>⌘</kbd> no lugar de <kbd>Ctrl</kbd>.</p>
      </>
    ),
  },
];

export function findArticle(id: string): GuideArticle | undefined {
  return guideArticles.find((article) => article.id === id);
}
