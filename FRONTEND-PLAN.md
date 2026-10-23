# Plano de UI do Frontend

## 1. Objetivo e princípios do produto

O frontend é a interface de um **linter narrativo**, não de um coautor. Ele
permite que o autor organize a ordem relativa da narrativa, submeta um
fragmento para análise, avalie diagnósticos rastreáveis e decida quais fatos
entram no cânone.

Princípios que orientam toda a UI:

- **Zero-prose:** não gerar, completar, reescrever ou sugerir parágrafos.
  A interface mostra diagnósticos, citações, fatos e orientações já fornecidos
  pela API.
- **Texto efêmero:** o conteúdo do editor existe somente no navegador e
  durante a submissão à API. Ele não deve ser salvo, enviado a telemetria,
  incluído em logs de cliente ou recuperado como histórico.
- **Decisão explícita do autor:** fatos propostos só mudam o cânone após
  aprovação; uma rejeição descarta toda a proposta.
- **Rastreabilidade:** todo diagnóstico mostra a citação que o originou e,
  quando aplicável, o fato canônico violado.
- **Não-linearidade visível:** slots podem estar ancorados por dependências
  relativas ou sem posição temporal (Inbox/Purgatório).

## 2. Escopo do core

### 2.1 Fluxo primário: revisão de uma cena

1. O autor seleciona um projeto e um slot, ou cria um slot.
2. Escreve ou cola um fragmento no editor local e escolhe o foco de revisão.
3. Submete o fragmento para análise.
4. Examina os diagnósticos e as citações correspondentes, sem alterar a prosa
   pela interface.
5. Examina a proposta de fatos do Arquivista, ajustando somente os dados
   estruturados que deseja consolidar.
6. Aprova o snapshot completo ou rejeita a proposta.
7. Se houver invalidações, vê quais slots descendentes ficaram sujos e pode
   navegar até eles.

### 2.2 Funcionalidades essenciais

| Área | Funcionalidade | Prioridade | Suporte atual da API |
| --- | --- | --- | --- |
| Contexto | Selecionar projeto e slot ativos | P0 | Parcial; não há listagem de projetos ou slots |
| Slots | Criar/editar título e vínculos temporais | P0 | Sim, por `PUT /slots/:slotId` |
| Slots | Consultar um slot por ID | P0 | Sim, por `GET /slots/:slotId` |
| Editor | Inserir texto local, escolher foco e gênero opcional | P0 | Sim, por `POST /scenes/submit` |
| Diagnósticos | Listar, filtrar por gravidade/tipo e localizar a citação no editor | P0 | Sim |
| Diagnósticos | Registrar uma quebra de continuidade como intencional | P0 | Sim, quando houver `violatedFactId` |
| Fatos | Revisar, editar, aprovar ou rejeitar o snapshot proposto | P0 | Sim |
| Regressões | Exibir slots impactados após aprovação | P0 | Sim |
| Regressões | Listar e reconhecer alertas de um slot | P0 | Sim |
| Linha do tempo | Visualizar o DAG completo do projeto | P1 | Não; faltam listagem de slots e arestas |
| Inbox | Listar e organizar slots não ancorados | P1 | Não; faltam listagem e sugestões de ancoragem |
| Cânone | Consultar entidades e fatos ativos do projeto | P1 | Não |
| Histórico | Recuperar versões ou texto de cenas anteriores | Fora do core atual | Não; incompatível com a política de texto efêmero |

P0 corresponde ao primeiro corte utilizável; P1 depende de extensões do
backend, mas deve influenciar a arquitetura de navegação desde o início.

## 3. Arquitetura de informação e telas

### 3.1 Casca da aplicação

- **Barra superior:** projeto ativo, estado da conexão/API e acesso a
  configurações.
- **Navegação lateral:** Revisão, Slots, Inbox e Alertas.
- **Contexto persistente:** `projectId` e `slotId` selecionados são mantidos
  na URL ou em estado local da sessão. Enquanto não existir catálogo de
  projetos/slots, a seleção deve aceitar UUIDs explicitamente e indicar essa
  limitação de forma clara.

### 3.2 Revisão

A tela principal usa três regiões redimensionáveis:

1. **Editor local:** área de texto, contador de caracteres, escolha de foco
   (`GENERAL`, `PACING`, `WORLDBUILDING` ou `PROSE_STYLE`) e gênero opcional.
   Não há salvamento automático nem botão de geração.
2. **Diagnósticos:** cartões agrupados por gravidade (`CRITICAL`, `WARNING`,
   `NOTE`) com tipo, mensagem, citação, orientação e ação de override somente
   para `CONTINUITY_BREAK` com `violatedFactId`.
3. **Proposta de fatos:** tabela editável com entidade, tipo, atributo, valor,
   caráter subjetivo e alegação de origem. Exige `sourceClaim` quando
   `isSubjective` for verdadeiro. As ações finais são **Aprovar snapshot** e
   **Rejeitar proposta**.

Após aprovar, um resultado confirma a quantidade de fatos e lista os IDs dos
slots afetados. A UI oferece navegação para o slot, mas não presume que o seu
texto esteja disponível.

### 3.3 Slots e dependências

Enquanto o backend não oferecer uma listagem, a tela é orientada ao slot
atual:

- consulta um slot pelo UUID;
- permite definir título;
- permite informar IDs de predecessores e sucessores;
- mostra se o slot está no Purgatório;
- oferece criação e remoção de uma dependência avulsa;
- mostra erros de ciclo retornados pela API sem ocultar a causa.

Quando existir a consulta do projeto, esta tela evolui para uma visão de grafo
com lista lateral, relações de entrada/saída e ação de editar vínculos.

### 3.4 Overrides e alertas

- **Overrides:** listagem dos overrides ativos do slot, formulário com fato
  violado e justificativa, edição por reenvio e remoção explícita.
- **Alertas:** lista por status (`PENDING` ou `ACKNOWLEDGED`), IDs de origem e
  destino, data de criação e ação de reconhecer. Alertas pendentes devem ser
  mais visíveis na navegação e na revisão do slot afetado.

## 4. Fluxos e regras de interação

### Submissão e resultado

- Desabilitar a submissão com texto vazio, sem esconder a validação recebida
  da API.
- Durante a análise, bloquear somente uma nova submissão do mesmo editor; o
  autor ainda pode navegar.
- Um novo resultado substitui a proposta transitória anterior daquele editor.
- A aprovação envia o conjunto inteiro de fatos atualmente exibidos. Remover
  um item da tabela significa não incluí-lo no snapshot.
- A rejeição não exige confirmação adicional após o autor confirmar a ação
  destrutiva; limpa somente a proposta, nunca o texto no editor.

### Overrides

- A ação só é apresentada quando o diagnóstico tem `violatedFactId`.
- A justificativa é obrigatória e deve explicar a exceção narrativa; ela não
  deve aceitar conteúdo gerado pela aplicação.
- Após salvar um override, o cartão correspondente deve refletir que a
  exceção é intencional, sem apagar o diagnóstico de maneira enganosa.

### Alertas de regressão

- Uma aprovação pode produzir alertas de slots descendentes; o resultado deve
  salientar que a revalidação é pendente.
- Reconhecer um alerta confirma ciência do impacto, mas não implica que a
  revalidação foi concluída.

## 5. Estados de interface e requisitos não funcionais

Cada tela que consulta a API precisa de estados de carregamento, vazio, erro
recuperável e sucesso. Erros devem mostrar a mensagem recebida da API, com
ação de tentar novamente quando fizer sentido; não devem converter falhas em
resultados vazios.

Requisitos transversais:

- Navegação e todas as ações devem ser utilizáveis por teclado, com foco
  visível e rótulos acessíveis.
- Gravidade não pode depender somente de cor; usar ícone, texto e contraste
  apropriado.
- Citações devem preservar quebras e permitir cópia.
- Não persistir `rawContent` em `localStorage`, logs, analytics ou cache de
  requisições. Se houver restauração de sessão no futuro, ela exige
  consentimento explícito do autor.
- Cancelar ou ignorar respostas obsoletas quando o autor enviar uma análise
  mais nova para o mesmo editor.
- Tipar requisições e respostas a partir de `docs/openapi.yaml`; validar
  limites de formulário no cliente sem duplicar regras de domínio.

## 6. Lacunas de API para a experiência completa

As rotas atuais viabilizam a revisão orientada por IDs, mas não suportam um
workspace autônomo. Antes ou em paralelo ao P1, o backend deve definir:

| Necessidade de UI | Contrato sugerido |
| --- | --- |
| Seletor de projetos | `GET /api/v1/projects`, `POST /api/v1/projects` e `GET /api/v1/projects/:projectId` |
| Lista/Inbox de slots | `GET /api/v1/projects/:projectId/slots` com filtros por `isUnanchored` e status de alerta |
| Grafo temporal | A listagem de slots deve incluir predecessores e sucessores, ou haver `GET /api/v1/projects/:projectId/dependencies` |
| Navegação pelos alertas | Respostas com título dos slots, ou dados suficientes para busca em lote |
| Explorador de cânone | `GET /api/v1/projects/:projectId/facts` e consulta de entidades/fatos ativos |
| Ancoragem assistida | Contrato explícito para sugestões de janela temporal, se esse mecanismo sair do domínio interno |

Esses contratos devem continuar sem incluir `rawContent` persistido.

## 7. Sequência de implementação proposta

1. Criar o shell, cliente HTTP tipado, tratamento de erros e contexto manual
   de projeto/slot.
2. Implementar a tela de Revisão: editor local, submissão, diagnósticos e
   proposta de fatos.
3. Implementar aprovação/rejeição, confirmação de impacto e gerenciamento de
   overrides.
4. Implementar tela orientada por ID para slots/dependências e alertas.
5. Após a expansão da API, substituir entrada manual por catálogo de projetos,
   lista/Inbox de slots, grafo temporal e explorador de cânone.

## 8. Critérios de aceite do primeiro corte

- Um autor consegue, usando somente a interface, criar ou atualizar um slot
  conhecido, submetê-lo e visualizar todos os diagnósticos retornados.
- Cada diagnóstico exibe tipo, gravidade, mensagem, citação e orientação; os
  de continuidade elegíveis permitem registrar uma exceção justificada.
- O autor consegue escolher o conjunto integral de fatos, aprová-lo ou
  rejeitá-lo, e vê os slots invalidados pela aprovação.
- O autor consegue consultar, filtrar e reconhecer alertas de regressão de um
  slot.
- O frontend não armazena nem gera prosa e comunica erros de API de modo
  explícito.
