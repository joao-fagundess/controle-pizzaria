# Evolução local do Thindesk: captura e export 1.0

O usuário aprovou a evolução após revisar o contrato complementar. O [PR #6](https://github.com/joao-fagundess/controle-pizzaria/pull/6) foi integrado em `develop` em 12/11/2026, com CI aprovada e commit `6e15ce0ee6e34e8d32d0c39bc3f56040f2156e75`. Esta etapa implementa a origem do export; recepção versionada, migrations, promoção e apresentação de completude no painel continuam sendo a próxima etapa.

## Preservação e execução

O ZIP com SHA-256 `CECBA3087577848DF5A975217F42AEE4821DB30B61E3D0DA326F90AB3E2E73C7` e os 29 arquivos originais em `.cache/thindesk-homologation/source` são verificados, sem modificações. `scripts/prepare-thindesk-analytics.mjs` monta outro contexto, `analytics-source`, acrescenta dois módulos Java e aplica três extensões verificadas ao serviço de escrita legado. Não copia a configuração nem os dados do ZIP. Um manifesto registra hashes dos arquivos originais, overlays, script, Dockerfile, Compose e resultado. Reexecuções recusam arquivos extras, links ou edições manuais da derivação, preservando essas alterações para inspeção.

O build habilita `maven.compiler.parameters=true`: sem essa opção, as rotas legadas com `@PathVariable` sem nome explícito falhavam com `500` no Spring 6. A correção preserva os nomes dos parâmetros no bytecode, sem editar o Java recebido. O heap Maven é limitado a 384 MiB; o Java em execução usa até 256 MiB de heap e o MongoDB tem cache WiredTiger de 256 MiB. Ambos os containers têm limite de 768 MiB.

```powershell
# Pré-requisitos: Docker Desktop, Node.js 24 e dependências de api instaladas.
./scripts/prepare-thindesk.ps1 -ZipPath 'C:\Users\arthur.randis\Documents\thindesk.zip'
node scripts/prepare-thindesk-analytics.mjs
docker compose --env-file .cache/thindesk-homologation/.env -f docker-compose.thindesk-analytics.yml up --build -d --wait --wait-timeout 360
node scripts/validate-thindesk-analytics.mjs --zip 'C:\Users\arthur.randis\Documents\thindesk.zip'
```

O projeto `thindesk-analytics-source` tem MongoDB, rede e volume próprios. Só o Java é publicado, em `http://127.0.0.1:8082/login`; o MongoDB não publica porta. As credenciais de homologação permanecem no `.env` ignorado pelo Git e não são exibidas. O teste completo verifica também o painel legado em `8180`, que deve estar ativo conforme o [procedimento anterior](homologacao-thindesk.md). As instâncias originais nas portas 8081 e 8180, a demonstração em 8080, `main` e a tag `v0.1.0` são preservadas.

Nesta execução em computador de 8 GB, a demonstração e o Java/MongoDB originais foram pausados temporariamente para liberar memória. Após os testes, esses serviços são restaurados e a evolução em 8082 é encerrada, mantendo imagem e volume. O estado final consta das [evidências](evidencias/thindesk-analytics.md). Evitar iniciar todos os ambientes simultaneamente nesse computador.

Para encerrar somente a evolução local, usar o mesmo comando Compose com `down`, sem `-v`. O volume é mantido. A habilitação `THINDESK_ANALYTICS_ENABLED=true` é explícita; os endpoints complementares não existem na imagem original.

## Fluxo de captura

Todas as rotas exigem a sessão já usada pelo Thindesk. Não há alteração na interface de cadastro original nesta etapa; a captura complementar é uma API para homologação. O painel continua somente de leitura.

| Método e rota sob `/api/v1/analytics` | Uso |
| --- | --- |
| `POST /catalog/types` | Registrar `{external_id,name}` de tipo na origem. Não configura o mapeamento futuro do painel. |
| `POST /catalog/requesters` | Registrar `{external_id,name,department?}` de solicitante. |
| `POST /catalog/staff` | Registrar `{external_id,name,role,active}`; papel `technician` ou `supervisor`. |
| `POST /tickets` | Capturar novo chamado: `title`, `description`, `priority`, `type_external_id`, `requester_external_id`, `assignee_external_id` explícito, podendo ser `null`. Retorna `201`, `{revision,ticket}`. |
| `GET /tickets/{id}` | Consultar snapshot e revisão para editar ou recuperar uma resposta perdida. |
| `PUT /tickets/{id}` | Substituir os seis campos de captura, mais `status` e `expected_revision`. |
| `POST /tickets/{id}/notes` | Acrescentar `{content,expected_revision}`. Notas não podem ser editadas ou excluídas. |
| `GET /tickets/export` | Baixar envelope `1.0` dos chamados capturados pelo novo fluxo. |

O catálogo é **imutável nesta versão local**. Repetir a mesma identidade e metadados é idempotente; metadados diferentes retornam `409`. Atualização de nomes/papéis/situação com propagação a snapshots depende de evolução posterior. Assim, os objetos de catálogo repetidos no export permanecem consistentes. São proibidos campos extras, incluindo e-mail e telefone. O autor é obtido do login da sessão: deve existir em `staff`, com `external_id` igual ao username e `active=true`. O cliente não escolhe autor, datas, IDs de chamados/fatos ou sequências. Não há associação por nome.

Os novos chamados começam em `open`, com prioridade informada e título original (`title_is_derived=false`). IDs são UUIDs gerados pela origem. `created_at` é o instante real da criação; `updated_at` acompanha alterações e notas. A operação sem mudanças preserva a revisão e as datas. Resolver/fechar registra a resolução atual, fechar após resolver a mantém, e reabrir a limpa. Uma nova resolução recebe novo instante. O relógio regressivo interrompe edição/export com `503`, sem inventar uma data futura.

Snapshot, campos da projeção legada, histórico, notas e revisão ficam no **mesmo documento MongoDB** da coleção `chamados`. A substituição condicionada à revisão é atômica por chamado. Duas operações com a mesma revisão resultam em um sucesso e um `409`; o cliente deve reler e decidir a próxima edição. Não há retentativa automática nem idempotência de criação por chave de cliente: repetir um `POST /tickets` cria outro chamado. A consulta de revisão permite recuperar uma edição cuja resposta foi perdida.

Cada criação produz um evento `created` de sequência 1. Mudanças de status, prioridade, tipo e responsável acrescentam fatos com IDs imutáveis e sequência contígua. Mudanças simultâneas compartilham o instante e preservam a ordem pela sequência. Título, descrição e solicitante alteram o snapshot e `updated_at`; não criam um tipo de evento fora do contrato. Histórico e notas são `complete` somente nos chamados acompanhados desde a criação por este fluxo.

## Export e compatibilidade

O export usa os quatro campos do envelope aprovado, sem credenciais ou metadados internos de revisão. `X-Thindesk-Exported` informa a quantidade exportada e `X-Thindesk-Excluded-Legacy` informa quantos documentos não possuem captura complementar. O JSON não é um export completo de todos os chamados antigos: os excluídos **continuam desconhecidos**, sem datas, prioridades ou identidades inventadas. Não há endpoint de conversão dos registros antigos.

O export é limitado a **5 MiB**, com `413` antes de enviar o lote se excedido; não há truncamento nem paginação nesta versão. Requisições de captura são limitadas a 1 MiB no parser. O resultado de cada chamado é um snapshot atômico, mas a leitura de toda a coleção não é uma transação global: edições concorrentes podem refletir momentos distintos por chamado, todos anteriores a `exported_at`. `Cache-Control: no-store` acompanha a resposta.

`GET /api/chamados` segue retornando `id`, `descricao`, `status`, `tipo`, `tecnico`, `usuario`. A projeção mapeia `open→ABERTO`, `resolved/closed→CONCLUIDO`, `in_progress/waiting→EM_ANDAMENTO`. Escritas pela API/formulário legado continuam nos documentos antigos. Nos novos, retornam `409` para impedir que um `repository.save` legado apague os fatos complementares. Essa restrição é necessária; a interface original não permite editar novos chamados analíticos nesta etapa.

Não há leitura deste contrato pelo conector atual e nenhuma alteração no PostgreSQL, nos indicadores ou na UI do painel. O teste conserva os três registros legados sintéticos e confirma que o painel segue com zero chamados canônicos e três rejeitados. Os testes novos criam registros fictícios no banco exclusivo; reexecutar preserva os existentes e acrescenta novos casos. A injeção controlada do teste de 5 MiB usa um ID reservado aleatório, removido ao final; não é dado operacional nem prova de recuperação após encerramento abrupto do processo.

## Verificação e próxima etapa

O [teste HTTP](../integration/thindesk/analytics.verify.mjs) exercita o WAR compilado e o MongoDB real. O [relatório](evidencias/thindesk-analytics/report.json) registra a execução local e a proveniência. A CI pública mantém os testes do schema e do projeto; o ZIP não é publicado e a compilação/teste do Java derivado exige o artefato local, não sendo reproduzida pela CI pública.

O leitor explícito `1.0`, a validação semântica, a migration e os sinais de proveniência/completude foram implementados na [recepção versionada](recepcao-versionada-thindesk.md). O export não deve ser enviado ao comando legado. Referências históricas sem cadastro resolvido continuam excluídas. A implantação fora do loopback continua dependendo de autenticação/autorização corporativa, HTTPS e homologação operacional.
