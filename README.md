# Dashboard administrativo de chamados técnicos

Baseline da aplicação existente nas Fases 1 a 5: API Node.js/TypeScript, PostgreSQL e dashboard React. O domínio é helpdesk de TI; o nome do repositório não define o produto.

## Execução local

Requer Node.js 24+. Na pasta api, executar npm ci, npm run build e npm run start:demo. Em outro terminal, na pasta web, executar npm ci e npm run dev. Abrir http://127.0.0.1:5173/.

A demonstração cria 480 chamados fictícios em banco embarcado descartável. Para PostgreSQL independente, consultar [endpoints](docs/endpoints.md). Configuração do frontend em [frontend](docs/frontend.md).

## Documentação e verificação

- [Requisitos](docs/requisitos.md), [decisões](docs/decisoes-de-analise.md) e [modelagem](docs/modelagem.md).
- [OpenAPI](docs/openapi.json), [requisições HTTP](docs/requisicoes.http) e [limitações da origem](docs/thindesk-inspecao.md).
- [Testes e cobertura](docs/evidencias/fase-5.md), [matriz RF → endpoint → teste](docs/rastreabilidade.md) e [capturas reais](docs/evidencias/fase-4.md).

Instalar as dependências de api e web e executar npm --prefix api run validate:phase-5. Passaram 99 casos distintos, 176 execuções e 13 verificações HTTP da API compilada; cobertura de linhas de 80,45% na API e 91,50% no frontend.

A Fase 6 acrescenta empacotamento em contêineres, documentação final e Gitflow nas branches de entrega. Até a aprovação da candidata, main preserva este baseline. A homologação com o Thindesk real, autenticação corporativa e desempenho sob carga permanecem pendentes.
