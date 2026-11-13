# Dashboard administrativo de chamados técnicos

Projeto de um painel para acompanhar chamados técnicos relacionados ao Thindesk, com indicadores, filtros, gráficos e consulta de histórico e considerações técnicas.

O domínio é **helpdesk de TI**. O nome da pasta local não define o domínio do produto.

## Estado da entrega

Fases 1 a 6 concluídas: análise, modelagem, migrations, seed, API REST, Swagger, recepção legada, dashboard React integrado, validação consolidada e entrega com Gitflow e Compose. A interface inclui indicadores, gráficos, filtros, tabela paginada, detalhe e atualização automática. A integração operacional com o Thindesk ainda depende da homologação da instância real e da recepção versionada do contrato complementar aprovado.

Na Fase 6, foram entregues Compose, imagens da API/frontend, proxy Nginx, validação em contêineres, workflow de CI, documentação final e roteiro do vídeo. Os quatro PRs foram integrados com autorização do usuário em 12/11/2026. A versão `0.1.0` reúne essa entrega em `main`; detalhes e evidências no [relatório da Fase 6](docs/evidencias/fase-6.md) e nas [notas da versão](docs/versao-0.1.0.md). Repositório: [joao-fagundess/controle-pizzaria](https://github.com/joao-fagundess/controle-pizzaria).

- [Requisitos, atores, casos de uso e regras de negócio](docs/requisitos.md)
- [Premissas, decisões e pontos a validar](docs/decisoes-de-analise.md)
- [Inspeção do Thindesk e limitações da origem](docs/thindesk-inspecao.md)
- [Modelo em Mermaid, constraints e índices](docs/modelagem.md)
- [Evidências da Fase 2](docs/evidencias/fase-2.md)
- [Endpoints e execução da API](docs/endpoints.md)
- [Contrato OpenAPI](docs/openapi.json) e [requisições HTTP](docs/requisicoes.http)
- [Recepção e limitações da integração](docs/integracao-thindesk.md)
- [Evidências da Fase 3](docs/evidencias/fase-3.md)
- [Dashboard: execução, configuração e comportamento](docs/frontend.md)
- [Evidências e capturas da Fase 4](docs/evidencias/fase-4.md)
- [Testes, cobertura e evidências da Fase 5](docs/evidencias/fase-5.md)
- [Matriz RF → endpoint → teste](docs/rastreabilidade.md)
- [Execução com Docker Compose](docs/implantacao.md)
- [Gitflow e revisão](docs/gitflow.md)
- [Documento final da entrega](docs/entrega.md)
- [Roteiro de vídeo de até três minutos](docs/roteiro-video.md)
- [Homologação local do Thindesk original](docs/homologacao-thindesk.md) e [evidências](docs/evidencias/thindesk-local.md)
- [Contrato complementar aprovado do Thindesk](docs/contrato-complementar-thindesk.md) e [testes estruturais](docs/evidencias/contrato-thindesk.md)
- [Captura e export na evolução local do Thindesk](docs/evolucao-local-thindesk.md)

## Estrutura atual

```text
api/
  src/
  migrations/
  seeds/
  scripts/
  tests/
web/
  src/
    components/
    services/
  tests/
docs/
  evidencias/
  prs/
  requisitos.md
  decisoes-de-analise.md
  thindesk-inspecao.md
  modelagem.md
scripts/                    Configuração local e validação do Compose
.github/                    Workflow de validação e template de PR
docker-compose.yml
README.md
```

A Fase 5 consolidou testes, cobertura e rastreabilidade. A Fase 6 acrescentou a execução com contêineres e os documentos de entrega.

A homologação complementar foi integrada em `develop` pelo [PR #5](https://github.com/joao-fagundess/controle-pizzaria/pull/5). Ela reproduz o Thindesk do ZIP com Java/MongoDB, bancos separados e três chamados fictícios. Os testes de login e recepção passaram; o [dashboard de homologação](http://127.0.0.1:8180/) mostra três exclusões e nenhum chamado canônico, pois os campos analíticos continuam ausentes. Preparação, acesso e comandos em [homologacao-thindesk.md](docs/homologacao-thindesk.md). Essa etapa é posterior à tag `v0.1.0`; `main` e a tag preservam a primeira entrega.

O [PR #6](https://github.com/joao-fagundess/controle-pizzaria/pull/6) integrou o contrato aprovado de export complementar `1.0`, com schema, exemplos e 44 testes estruturais. A evolução local acrescenta captura e export em uma cópia derivada, na porta 8082, com datas reais, identidades, notas e histórico de novos chamados. O conector existente não consome esse formato; a promoção depende da validação semântica, do mapeamento e da apresentação de completude ainda a implementar. Procedimento e limites em [evolucao-local-thindesk.md](docs/evolucao-local-thindesk.md).

## Execução e configuração

Pré-requisitos do Compose: Node.js 24+, Docker Desktop com engine Linux e Compose em execução. Na raiz:

```powershell
node scripts/prepare-compose.mjs
docker compose up --build -d --wait --wait-timeout 120
docker compose --profile demo run --rm seed
```

Dashboard: [http://127.0.0.1:8080/](http://127.0.0.1:8080/). Swagger: [http://127.0.0.1:8080/docs/](http://127.0.0.1:8080/docs/). O banco tem volume persistente; somente o frontend publica uma porta, restrita ao computador local. O seed opcional carrega os 480 chamados fictícios. As credenciais são geradas em `.env`, sem aparecer no frontend. Para parar e preservar os dados, usar `docker compose down`. Configuração e manutenção em [implantacao.md](docs/implantacao.md).

Para executar a API com dados fictícios, sem Docker, usar Node.js 24 ou superior:

```powershell
Set-Location api
npm.cmd ci
npm.cmd run build
npm.cmd run start:demo
```

Swagger: [http://127.0.0.1:3000/docs/](http://127.0.0.1:3000/docs/). A demonstração cria 480 chamados em PostgreSQL embarcado e perde os dados ao encerrar.

Com a API em execução, abrir outro terminal na raiz do projeto para o dashboard:

```powershell
Set-Location web
npm.cmd ci
npm.cmd run dev
```

Dashboard: [http://127.0.0.1:5173/](http://127.0.0.1:5173/). O frontend usa proxy local para a API. Para validar a versão compilada, executar `npm.cmd run build` e `npm.cmd run preview` na pasta `web`; a prévia usa a porta 4173.

Para usar um PostgreSQL independente, ainda na pasta `api`:

```powershell
Copy-Item .env.example .env
# Ajustar DATABASE_URL no .env antes de executar.
npm.cmd run db:migrate
npm.cmd run db:seed
npm.cmd start
```

`DATABASE_URL` configura o PostgreSQL. `SEED_REFERENCE_DATE` fixa opcionalmente o calendário do seed; sem ela, usa hoje em São Paulo. `HOST` e `PORT` definem a escuta; `CORS_ORIGINS` permite origens explícitas. `API_ACCESS_TOKEN` protege `/api/v1` com bearer e é obrigatório em produção ou fora do loopback. O seed só deve ser aplicado em banco exclusivo de demonstração. Configuração completa em [endpoints.md](docs/endpoints.md).

Para verificar toda a entrega, executar na raiz depois de instalar as dependências de `api` e `web`:

```powershell
npm.cmd --prefix api run validate:phase-5
```

O comando compila API e frontend, verifica tipos, executa as suítes em bancos descartáveis e gera cobertura e matriz. Não lê `DATABASE_URL` nem usa banco operacional. O PostgreSQL nativo é um processo temporário em loopback, instalado como dependência de desenvolvimento; dispensa Docker e serviço do Windows. Os binários portáteis são obtidos durante a instalação das dependências. Esta execução foi validada no Windows x64 com Node.js 24.21.0 e PostgreSQL 18.6.

Passaram **99 casos distintos**: 14 de integridade, 63 de API/regras/conector/OpenAPI e 22 do frontend. Repetir os 77 casos de backend em PostgreSQL nativo por TCP totalizou **176 execuções**, além de **13 verificações HTTP da API compilada**. Cobertura de linhas: API **80,45%** e frontend **91,50%**, com escopo e lacunas no relatório da Fase 5.

Para verificações menores, `npm.cmd test` na pasta `api` executa tipos, integridade e API no banco embarcado; `npm.cmd run test:coverage` mede a API; `npm.cmd run test:postgres` exige o build da API e executa o banco nativo. Na pasta `web`, `npm.cmd test` executa os 22 testes de componentes, consultas, serviço HTTP e polling; `npm.cmd run test:coverage` gera cobertura e `npm.cmd run build` verifica tipos e gera `web/dist`.

A interface foi verificada no navegador com a API do projeto em 360, 768 e 1440 pixels, incluindo falha de conexão e recuperação. As capturas da Fase 4 continuam representativas: os nomes com hash dos quatro assets compilados coincidem na Fase 5.

As configurações públicas do frontend são `VITE_API_BASE_URL` e `VITE_POLL_INTERVAL_SECONDS`. `API_PROXY_TARGET` e o eventual `API_ACCESS_TOKEN` ficam somente no servidor do proxy local. A implantação estática precisa de gateway autenticado; não colocar credenciais em variáveis `VITE_*`. Ver [frontend.md](docs/frontend.md).

Para verificar o empacotamento em contêineres, executar `node scripts/validate-compose.mjs` na raiz. O comando usa porta, credenciais e projeto Compose próprios, testa HTTP e persistência e remove seus recursos descartáveis. Os resultados ficam em `docs/evidencias/fase-6/`. O workflow em `.github/workflows/validation.yml` executa os checks nas branches de entrega e PRs; resultados em [GitHub Actions](https://github.com/joao-fagundess/controle-pizzaria/actions).

## Stack e decisões

API REST com Node.js, Express e TypeScript; PostgreSQL; validação com Zod; testes com Vitest e Supertest; contrato OpenAPI e Swagger. O frontend usa React, Vite, Recharts e TanStack Query para isolamento por seleção, cache e cancelamento. A justificativa está no registro de decisões e na documentação do frontend.

Indicadores, distribuição e lista usam criação; série e ranking de atendimentos usam resolução vigente. Resolvidos inclui fechados, e o tempo médio usa horas corridas. O resumo informa a qualidade global dos registros recebidos.

O Thindesk fornecido usa Java/MongoDB e possui listagens autenticadas, mas seus chamados não têm datas, prioridade, histórico ou considerações técnicas. O comando `npm.cmd run thindesk:sync` preserva os legados e os motivos de rejeição separados dos indicadores; não promove dados incompletos. Sua autenticação foi testada com uma origem HTTP local controlada. Credenciais do ZIP não foram copiadas nem usadas.

O PostgreSQL independente foi validado na Fase 5, e a etapa complementar executou o código original do Thindesk em ambiente local com dados fictícios. A homologação da instância operacional e a autenticação corporativa continuam pendentes. Os planos SQL com 10 mil registros são uma inspeção local, sem comprovação da meta de p95 ou concorrência. A branch `release/0.1.0` preserva a candidata integrada e a tag `v0.1.0` identifica a primeira entrega em `main`. O roteiro foi entregue, mas o vídeo ainda precisa ser gravado.
