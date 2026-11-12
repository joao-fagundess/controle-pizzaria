# API REST — Fase 3

API de leitura em `/api/v1`, implementada com Express e TypeScript. O contrato completo com schemas, parâmetros, respostas e exemplos está em [openapi.json](openapi.json). Com o servidor em execução, Swagger fica em `/docs/` e o mesmo contrato em `/docs/openapi.json`.

## Executar

Na pasta `api`, com Node.js 24 ou superior:

```powershell
npm.cmd ci
npm.cmd run build
# Demonstração local com PostgreSQL em memória e 480 chamados fictícios:
npm.cmd run start:demo
```

Acessar `http://127.0.0.1:3000/docs/`. A demonstração é descartável: reiniciar recria o banco. Não precisa de Docker, conexão externa, MongoDB ou credenciais do ZIP. Usa a data corrente para o seed, salvo se `SEED_REFERENCE_DATE` estiver definida.

Para PostgreSQL independente, configurar `api/.env` a partir de `.env.example` e executar:

```powershell
npm.cmd run db:migrate
# Apenas em banco exclusivo de demonstração:
npm.cmd run db:seed
npm.cmd start
```

O servidor normal não aplica migrations nem seed automaticamente. Não existe operação de escrita de chamados pela API.

## Configuração

| Variável | Padrão / comportamento |
| --- | --- |
| `DATABASE_URL` | Obrigatória no servidor normal e no comando de recepção; conexão PostgreSQL. |
| `HOST` | `127.0.0.1`; demo aceita apenas loopback. |
| `PORT` | `3000`, de 1 a 65535. |
| `NODE_ENV` | `development`; aceita também `test` e `production`. |
| `CORS_ORIGINS` | `http://localhost:5173,http://127.0.0.1:5173`; lista de origens explícitas, sem curingas ou caminhos. |
| `API_ACCESS_TOKEN` | Opcional apenas no desenvolvimento local; quando definido, exige `Authorization: Bearer <token>` em `/api/v1`. Mínimo de 32 caracteres. Obrigatório em produção ou quando `HOST` não é loopback. |
| `SEED_REFERENCE_DATE` | Opcional, `YYYY-MM-DD`; fixa o calendário da demonstração. |

As variáveis do conector estão em [integracao-thindesk.md](integracao-thindesk.md). Segredos ficam apenas no servidor. `API_ACCESS_TOKEN` é uma credencial técnica de acesso: o gateway corporativo deverá autenticar usuários, aplicar a política de acesso e manter o token fora de bundles públicos do frontend. Não foi criado cadastro/login de usuários no dashboard. HTTPS e autenticação corporativa de implantação continuam pendentes de homologação; CORS não autentica clientes.

`/health` e a documentação são públicos e não expõem chamados, credenciais ou payloads recebidos. O contrato servido ajusta sua declaração de segurança conforme a exigência de bearer da instância; o arquivo exportado descreve a configuração protegida.

## Endpoints

| Método e rota | Conteúdo principal | Base do período |
| --- | --- | --- |
| `GET /api/v1/dashboard/summary` | `summary`: contagens, média em segundos e taxa percentual; `meta.source_quality`: qualidade global da origem. | Criação |
| `GET /api/v1/dashboard/tickets-by-period` | `periods`: início do agrupamento e quantidade de conclusões; `group_by`. | Resolução vigente |
| `GET /api/v1/dashboard/status-distribution` | `statuses`: cinco status com contagens, incluindo zero. | Criação |
| `GET /api/v1/dashboard/top-ticket-types` | `types`: ranking de tipos concluídos; `limit`. | Resolução vigente |
| `GET /api/v1/tickets` | `tickets`, `pagination`, `sort_by`, `sort_order`; última consideração sem duplicar chamados. | Criação |
| `GET /api/v1/tickets/:id` | `ticket`, `technical_notes`, `history`; notas e eventos em ordem cronológica. | Não recebe filtros |
| `GET /api/v1/filters/options` | `options`: status, tipos, prioridades e técnicos. | Não recebe filtros |

`GET /health` verifica a comunicação com o banco e retorna `{ "status": "ready" }`; em falha, usa a mesma resposta genérica de erro 500. Não é um endpoint de métricas do helpdesk.

## Filtros e semântica

Filtros comuns às quatro consultas analíticas e à listagem: `start_date`, `end_date`, `status`, `type_id`, `priority`, `assignee_id`. Todos combinam com E lógico e aceitam um valor por campo. Parâmetros repetidos, desconhecidos ou não aceitos pela rota são rejeitados.

- Datas seguem `YYYY-MM-DD`, sempre em par. Omitir ambas consulta todo o histórico; início depois do fim ou data inexistente retorna 422.
- O fuso é `America/Sao_Paulo`. O início é inclusivo e o fim usa o início do dia seguinte como limite exclusivo, convertido no banco para UTC.
- `status`: `open`, `in_progress`, `waiting`, `resolved`, `closed`. “Atendidos” e a contagem `summary.resolved` incluem `resolved` e `closed`.
- `priority`: `low`, `normal`, `high`, `urgent`. Tipos e técnicos recebem UUIDs existentes, obtidos em `/filters/options`.
- `group_by=day|week|month`, padrão `day`, apenas na série. Semana começa na segunda-feira; períodos parciais contam somente o intervalo selecionado. O rótulo indica o início do agrupamento, podendo anteceder `start_date` numa semana ou mês parcial.
- `limit`, padrão 5, entre 1 e 20, apenas no ranking. Desempate por nome em collation `C` e UUID.
- `page`, padrão 1; `page_size`, padrão 25, máximo 100. Página além do fim retorna lista vazia e mantém o total. O deslocamento deve caber em inteiro seguro de JavaScript.
- `sort_by=created_at|updated_at|resolved_at|priority`, padrão `created_at`; `sort_order=asc|desc`, padrão `desc`. Prioridade usa severidade numérica; nulos ficam por último; UUID desempata na mesma direção.

Na série, datas omitidas usam os limites das resoluções selecionadas. Sem conclusões e sem datas, a resposta é vazia. Com intervalo explícito, os agrupamentos aparecem com zero. Filtrar status não concluído também produz série zerada e ranking vazio.

O tempo médio é a média de `resolved_at - created_at` em segundos corridos, incluindo espera e tempo anterior à reabertura. Reabrir remove o chamado da série até a próxima resolução; a série não conta eventos antigos do histórico. Taxa é `100 × resolvidos / total` da população criada no período. A API não arredonda essas métricas. Média sem conclusões e taxa sem chamados são `null`.

## Respostas

Cada endpoint usa um nome do domínio na raiz (`summary`, `tickets`, `types` etc.) e `meta` com `request_id`, `generated_at`, `time_zone`, `period_basis` e filtros quando aplicáveis. Instantes são ISO 8601 em UTC, normalizados com sufixo `Z`. Rótulos de agrupamento são datas locais, sem horário. Ausência de autor, técnico ou última nota usa `null`; textos de apresentação pertencem ao frontend.

O resumo inclui `meta.source_quality`: quantidade de registros recebidos, rejeitados, pendentes e vinculados, último recebimento e modo da base normalizada (`empty`, `demo`, `operational`, `mixed`). São contagens globais da recepção, independentemente dos filtros; `received` conta identidades preservadas, não o total histórico de requisições. `last_received_at` é observação local, não atualização original nem garantia de sincronização completa.

Dados de `ticket_source_records` não entram nos indicadores. Os erros detalhados de recepção ficam no banco, sem endpoint público para payloads ou credenciais.

Exemplo:

```http
GET /api/v1/dashboard/summary?start_date=2026-10-12&end_date=2026-11-11&status=resolved
Accept: application/json
```

Exemplos completos e executáveis estão em [requisicoes.http](requisicoes.http). As respostas ilustrativas completas estão no Swagger.

## Erros

```json
{
  "error": {
    "code": "INVALID_QUERY",
    "message": "Os parâmetros de consulta precisam de correção.",
    "details": [{ "field": "period", "message": "O início deve ser anterior ou igual ao fim." }]
  }
}
```

| HTTP | Situação |
| --- | --- |
| 400 | Formato inválido de data, UUID ou número; parâmetros repetidos/desconhecidos. |
| 401 | Bearer ausente ou incorreto quando exigido; inclui `WWW-Authenticate: Bearer`. |
| 403 | Origem de navegador não permitida em CORS. |
| 404 | Chamado ou rota inexistente. |
| 422 | Intervalo, enumeração, limite, página ou referência de catálogo semanticamente inválidos. |
| 500 | Falha inesperada, sem SQL, senha ou stack na resposta. |

Toda resposta inclui `X-Request-Id`. Logs JSON registram identificador, método, caminho sem query string, status e duração; falhas conhecidas registram código, e falhas de banco podem registrar SQLSTATE. Não registram autorização, URL de conexão, corpos ou considerações técnicas.

## Estrutura e decisões de implementação

- `app.ts`: rotas e política HTTP, sem controllers que apenas repassem métodos.
- `ticket-filters.ts`: validação de formato com Zod e validação semântica/catalogal.
- `ticket-repository.ts`: SQL parametrizado e agregações no banco; listagem e total usam a mesma instrução/snapshot, com seleção da página antes das notas.
- `ticket-metrics.ts`: fórmula da taxa sem arredondamento; a média e as contagens são agregadas no PostgreSQL.
- `configuration.ts` e `server.ts`: configuração validada, pool com timeout, inicialização e encerramento.
- `thindesk-reader.ts`, `thindesk-import.ts` e `thindesk-sync.ts`: leitura, recepção e comando operacional, conforme o contrato legado.
- `openapi.ts`: definição única do Swagger e do JSON exportado.

Express 5 encaminha rejeições de rotas assíncronas ao middleware de erro; não foi criado um wrapper de try/catch por rota. Datas são convertidas pelo PostgreSQL para respeitar regras históricas de fuso. Os planos com 10 mil registros estão nas [evidências](evidencias/fase-3.md); não houve medição de p95 em servidor independente.

A [Fase 5](evidencias/fase-5.md) executou as suítes contra PostgreSQL 18.6 independente por TCP, além de 13 verificações HTTP da API compilada usando `pg.Pool`. Essa execução valida integração e comportamento funcional; a meta de p95 permanece sem medição de carga.

## Referências técnicas

- [Express — erros em funções assíncronas](https://expressjs.com/en/guide/error-handling/).
- [Zod — schemas e validação](https://zod.dev/api).
- [node-postgres — consultas parametrizadas](https://node-postgres.com/features/queries).
- [PostgreSQL 18 — datas, agrupamento e fuso](https://www.postgresql.org/docs/18/functions-datetime.html).
