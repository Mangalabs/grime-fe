# Grime Frontend

Interface React do Grime, o linter narrativo. O editor trata o fragmento como
conteúdo efêmero: ele é enviado somente para análise e não é persistido pelo
cliente.

## Desenvolvimento

1. Inicie a API em `..\grime-be` com `npm run dev`.
2. Neste diretório, execute `npm run dev`.

Durante o desenvolvimento, o Vite encaminha as chamadas `/api` para
`http://localhost:3000`, evitando a necessidade de configurar CORS no
backend. Para uma implantação em que o frontend e a API estejam em origens
distintas, defina `VITE_API_BASE_URL` com a origem da API:

```bash
VITE_API_BASE_URL=https://api.exemplo.com npm run build
```

## Comandos

```bash
npm run dev
npm run lint
npm run build
```

## Estrutura

- `src/api`: tipos que espelham os contratos v1 e cliente HTTP.
- `src/features/review`: estado e orquestração do fluxo de análise.
- `src/components`: componentes de apresentação para contexto, editor,
  diagnósticos, fatos, overrides e alertas.

O escopo e as decisões de UX estão documentados em
[`FRONTEND-PLAN.md`](FRONTEND-PLAN.md).
