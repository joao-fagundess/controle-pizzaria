# Contrato complementar do Thindesk — versão 1.0

**Estado: aprovado para evolução local da origem.** O usuário autorizou a próxima parte em 12/11/2026 e o [PR #6](https://github.com/joao-fagundess/controle-pizzaria/pull/6) foi integrado em `develop`, commit `6e15ce0ee6e34e8d32d0c39bc3f56040f2156e75`, após CI aprovada. A [implementação local de captura e export](evolucao-local-thindesk.md) deriva uma cópia separada; o ZIP e a extração original permanecem preservados. O conector do painel continua exclusivamente legado, sem promoção para `tickets`.

Entregáveis: [JSON Schema 2020-12](contracts/thindesk-analytics-v1.schema.json), [exemplo resolvido](contracts/examples/valid-resolved.json), [exemplo reaberto/parcial](contracts/examples/valid-reopened-partial.json), [legado recusado](contracts/examples/invalid-legacy.json) e [testes estruturais](../integration/thindesk/contract.test.mjs). Todos os exemplos são fictícios. Validade estrutural não autoriza importação nem comprova a origem dos valores.

## Decisões aprovadas

| ID | Proposta | Motivo |
| --- | --- | --- |
| CP01 | Envelope versionado `1.0`, com export JSON como primeiro transporte. | Permite validar um lote antes de acrescentar um endpoint na origem. |
| CP02 | Datas, prioridade, tipo mapeado e solicitante identificado são obrigatórios para os indicadores. | São necessários aos filtros e cálculos já aprovados; não serão preenchidos por padrão. |
| CP03 | Técnico ausente e autor desconhecido podem ser `null`, com significados explícitos. | Evita inventar pessoas ou atribuir autoria. |
| CP04 | Histórico e notas declaram cobertura `complete`, `partial` ou `unavailable`. | Uma coleção desconhecida não comprova ausência de eventos ou notas. |
| CP05 | Título derivado é permitido, marcado por `title_is_derived`; identidades de eventos/notas são estáveis. | Aproveita a descrição legada sem fingir um título original e permite repetição sem duplicação. |
| CP06 | Promoção exige validação semântica e apresentação da completude no painel. | O schema não compara datas, resolve catálogos ou comprova transições. |
| CP07 | Eventos incluem sequência estável por chamado. | Evita inventar ordem causal a partir de IDs opacos quando dois eventos têm o mesmo instante. |

Aplicação aprovada: evoluir a origem local para capturar informações futuras. Para dados antigos, aceitar um export complementar apenas quando houver evidência confiável e vínculo pelo identificador do chamado. Acrescentar campos agora não recupera o passado.

## Alternativas de produção do export

| Alternativa | Vantagem | Limite |
| --- | --- | --- |
| Evoluir o Java/MongoDB | Registra datas, prioridade, vínculos e movimentações no momento correto. | Exige alterações do modelo e dos fluxos de escrita da origem. |
| Export complementar confiável | Permite aproveitar informações que já existam em outra fonte autorizada. | Exige comprovar correspondência e significado dos campos; nomes de pessoas não bastam. |

O export é a fronteira comum das duas opções. A evolução local publica o DTO em `GET /api/v1/analytics/tickets/export`, sob login/sessão e limite de 5 MiB, somente no loopback. `GET /api/chamados` preserva seus seis campos. As escritas legadas de chamados complementares retornam `409` para proteger os fatos; as de chamados antigos continuam disponíveis. HTTPS remoto e autorização corporativa continuam necessários antes de disponibilizar a evolução fora da homologação local.

## Envelope e dados principais

| Campo | Regra proposta |
| --- | --- |
| `contract_version` | Literal `1.0`. Alterações de estrutura precisam de nova versão e suporte explícito do consumidor. |
| `source_system` | Literal `thindesk`; não é escolhido por entrada livre do usuário. |
| `exported_at` | Instante real de produção do export, com offset ou `Z`. Não substitui nenhuma data de negócio. |
| `tickets` | Lista de snapshots. Lista vazia é permitida e não autoriza excluir chamados locais. |
| `external_id` | Identificador opaco, estável e sensível a caixa, de até 256 caracteres, sem espaços/controles. Preservar o `id` MongoDB textual. |
| `title`, `title_is_derived` | Título não vazio de até 240 caracteres e indicação booleana de derivação. |
| `description` | Texto completo da origem; não converter em consideração técnica. |
| `status` | `open`, `in_progress`, `waiting`, `resolved` ou `closed`. O DTO novo usa códigos, não textos livres. |
| `priority` | `low`, `normal`, `high` ou `urgent`, informado por fonte confiável. Ausência não vira `normal`. |
| `type` | Objeto com `external_id` estável e nome, dependente de mapeamento aprovado para o catálogo analítico. |
| `requester` | Objeto com `external_id` e nome; `department` opcional, como texto ou `null`. |
| `assignee` | Pessoa com identidade, nome, papel `technician` e `active` explícito; ou `null` quando a origem confirma ausência de atribuição. |
| `created_at`, `updated_at` | Instantes confiáveis, obrigatórios. `updated_at` precisa refletir mudanças do snapshot, inclusive notas e metadados nele incluídos. |
| `resolved_at` | Obrigatório e não nulo em `resolved`/`closed`; `null` nos demais estados. |
| `history`, `technical_notes` | Objetos de cobertura e itens, sempre presentes, inclusive quando indisponíveis. |

Instantes usam RFC 3339/ISO 8601 com fuso explícito, por exemplo `2026-11-12T10:00:00.000-03:00` ou `2026-11-12T13:00:00.000Z`. O receptor normalizará para UTC; agrupamentos continuam no calendário de São Paulo. Não deduzir datas de ObjectId, horário de importação, arquivo ou login. Um horário local sem offset é inválido.

Não são solicitados telefone, e-mail, senha, cookie ou token no export. Os objetos não aceitam campos extras no schema. Texto é conteúdo literal; o painel deve continuar escapando HTML. Controles incompatíveis com o armazenamento são recusados. O limite de transporte proposto mantém os 5 MiB já usados pelo leitor; o tamanho em bytes não é uma regra do JSON Schema. Lotes maiores exigem divisão controlada ou um protocolo de paginação futuro, sem truncamento silencioso.

## Identidades e mapeamento

O par `(source_system, external_id)` identifica o chamado e as pessoas na API analítica. UUIDs locais continuam sendo chaves internas. Não usar nome como identidade, não mesclar homônimos e não presumir que `usuario` corresponde a `Cliente.nome`. O vínculo com um cadastro deve ser confirmado na origem.

`assignee: null` significa sem responsável conhecido pela própria origem, não um nome que o conector não conseguiu identificar. Se há um técnico textual sem vínculo estável, o registro continua incompleto. Autores de eventos/notas podem ser `null` quando genuinamente desconhecidos. Autores identificados têm `external_id`, nome, papel `technician`/`supervisor` e `active`; essa informação não cria uma conta de login no dashboard.

Objetos de pessoa e tipo repetidos no export descrevem o cadastro no instante do export, inclusive quando aparecem como autores de fatos antigos. A autoria histórica é preservada pelo identificador; nomes ou papéis antigos não são reconstruídos. Assim, a mesma identidade deve ter metadados coerentes nas diferentes posições do lote.

Tipos usam um mapeamento explícito de identidade externa para código do catálogo local. Exemplo **fictício**, utilizado apenas nos arquivos de exemplo:

| Tipo externo de exemplo | Código local |
| --- | --- |
| `type-printing` | `printing` |
| `type-hardware` | `hardware` |

Esse quadro não cadastra mapeamentos operacionais. `Manutenção` não vira hardware por semelhança de nome. Tipo sem mapeamento ou metadados contraditórios para a mesma identidade ficam pendentes de correção. As normalizações legadas de `ABERTO`, `EM_ANDAMENTO` e `CONCLUIDO` permanecem restritas ao fluxo legado; não liberam registros sem os outros campos.

Um título derivado pode ser produzido do texto da descrição, preservando a descrição integral e marcando `title_is_derived: true`. A regra de apresentação deve usar no máximo 240 caracteres Unicode e identificar a derivação ao usuário. A flag não torna aceitáveis datas ou prioridade inventadas.

## Histórico e considerações técnicas

Cada coleção tem `{ "coverage": "...", "items": [...] }`:

| Cobertura | Significado e representação |
| --- | --- |
| `complete` | A origem afirma que forneceu todos os registros. Notas podem ter lista vazia; histórico completo exige uma única criação real. |
| `partial` | Há observações confiáveis, mas a origem não garante o histórico integral. Exige pelo menos um item e aviso de parcialidade. |
| `unavailable` | A origem não fornece essa coleção. Exige lista vazia e apresentação “Não fornecido pela origem”, sem afirmar ausência. |

Uma nota tem `external_id`, `author`, `content` e `created_at`. Um evento tem `external_id`, `sequence`, `event_type`, `author`, `occurred_at`, `previous_value` e `new_value`. IDs de notas/eventos são únicos dentro de cada chamado e não mudam em novas exportações. Para a primeira versão, propõe-se anexar fatos imutáveis; correções exigem novo registro explicativo ou revisão do contrato, sem reescrever evidências silenciosamente.

`sequence` é um inteiro positivo, único e crescente por chamado, atribuído pela origem ao registrar o fato. Na cobertura completa, a criação inicia em 1 e os movimentos conhecidos seguem sem lacunas; na parcial, lacunas são permitidas e explicitam a cobertura incompleta. Instantes não diminuem ao aumentar a sequência. Eventos simultâneos usam essa ordem causal; notas continuam com instante e identidade como desempate estável. Não inventar sequência a partir de um ID MongoDB ou da ordem de leitura. Essa proposta exige persistir e usar a sequência no histórico importado; não altera agora a ordenação da API existente.

| Evento | Valores |
| --- | --- |
| `created` | Anterior `null`; novo objeto com status, identidade do tipo, prioridade e identidade do técnico ou `null` no momento da criação. |
| `status_changed` | Códigos anterior e novo de status. |
| `priority_changed` | Códigos anterior e novo de prioridade. |
| `type_changed` | Identidades externas anterior e nova do tipo. |
| `assignee_changed` | Identidades externas anterior e nova do técnico, permitindo `null`. |

O histórico conserva a resolução antiga quando há reabertura; `resolved_at` atual volta a `null`. Uma nova resolução recebe nova data. Fechar um chamado já resolvido preserva a resolução vigente; fechamento direto precisa trazer data de resolução válida. A série e o ranking continuam contando uma única conclusão vigente por chamado, conforme RN04, sem contar eventos como chamados.

Não fabricar criação ou movimentações a partir de snapshots. Se a fonte só passou a registrar mudanças agora, o histórico anterior é parcial ou indisponível. Conhecer `created_at` não comprova que existe um evento original de criação.

## Validação estrutural e validação semântica

O schema executável verifica formato, campos obrigatórios, códigos, papel do responsável, resolução condicional, estrutura de eventos e combinação de cobertura/lista. O validador de referência usa Ajv 2020 com formatos completos, sem coerção, defaults ou remoção de campos. Um `true` nesse teste significa apenas que a estrutura corresponde à proposta.

As regras abaixo são obrigatórias para a **implementação futura**, mas não são executadas pelo JSON Schema desta entrega:

| Regra semântica | Resultado necessário antes da promoção |
| --- | --- |
| Cronologia | `created_at ≤ updated_at ≤ exported_at`; resolução entre criação e atualização; notas/eventos dentro da vida conhecida do chamado. |
| Identidade | Nenhum chamado duplicado no lote; IDs de notas/eventos sem repetição por chamado; pessoas/tipos repetidos sem metadados conflitantes. |
| Catálogo e vínculos | Tipo mapeado, pessoas resolvidas por identidade, autores conhecidos compatíveis com seus cadastros e referências de eventos resolvidas. |
| Histórico | Sequências sem repetição, ordem temporal e transições coerentes, criação completa no instante correto e estado final compatível com o snapshot. Histórico parcial não pode ser anunciado como completo. |
| Resolução | Reabertura limpa a vigente; fechamento após resolução preserva seu instante; ciclos antigos não aumentam conclusões atuais. |
| Atualização | `created_at` é imutável. Snapshot mais antigo não sobrescreve o aceito. Mesmo `updated_at` com payload diferente é conflito a corrigir, não permissão para escolher arbitrariamente. |
| Idempotência | Mesma identidade e mesmo snapshot não duplicam chamado, pessoa, evento ou nota. Data de recebimento não altera datas de negócio. |
| Completude | Título derivado e cobertura de notas/histórico precisam chegar à API e à interface antes da promoção de dados que dependam desses avisos. |

O teste inclui casos que passam no schema, mas violam cronologia ou unicidade, para deixar essa fronteira verificável. Eles não são exemplos aprovados para importação. O schema também não autentica o produtor, confirma a veracidade dos dados ou concede acesso aos indicadores.

## Recepção, atualização e compatibilidade

Proposta de fluxo: conferir versão/envelope/limite → identificar e validar cada chamado → resolver catálogos e semântica → promover em transação ou preservar o rejeitado. Falha de envelope, identidades duplicadas ou metadados contraditórios impedem o lote. Um registro sem identidade é contabilizado como não identificado; não recebe ID fabricado.

Novos registros identificados e inválidos podem ser preservados como `rejected`, sem vínculo canônico, usando a área de recepção atual. Para um chamado já vinculado, uma atualização inválida deve abortar o lote e conservar o snapshot e o chamado aceitos. A tabela atual não permite manter vínculo e erros simultaneamente: não remover esse vínculo nem apagar dados válidos para forçar uma rejeição. A auditoria de cada tentativa inválida exigiria armazenamento adicional e fica para decisão própria; o export enviado permanece com seu operador.

Para snapshots vinculados, o payload preservado representa a versão aceita. Uma observação mais antiga pode atualizar apenas a observação local, sem substituir essa versão. Essa distinção precisa ser documentada na futura migration/comentário e no relatório de recepção. Ausência de um chamado no export nunca implica exclusão. Coleções marcadas completas não autorizam apagar fatos locais previamente importados; divergência exige correção explícita.

Nesta proposta, dados principais completos poderão sustentar KPIs mesmo com notas/histórico parciais ou indisponíveis, **depois** de implementar os avisos correspondentes. Não aceitar silenciosamente o DTO novo no comando legado. A futura importação deve selecionar a versão explicitamente; os sete endpoints atuais continuam com seus contratos enquanto as extensões de metadados são projetadas e testadas.

## Estado da implementação após aprovação

1. **Implementado na cópia local derivada:** captura de datas, prioridade, vínculos, notas/histórico completos de novos chamados e export versionado. Procedimento e limites em [evolução local](evolucao-local-thindesk.md). Não recupera dados antigos nem altera a instância operacional.
2. Implementar o leitor da versão nova, validação semântica, mapeamento de tipos e promoção transacional. Preservar o fluxo legado e sua política `promoted: 0`.
3. Acrescentar, em migration nova, identidade externa de notas/eventos e sua unicidade por chamado, além da sequência dos eventos; definir persistência da proveniência/completude e da versão aceita. Não alterar migrations já aplicadas.
4. Expor metadados de completude e título derivado na API própria e atualizar os rótulos do frontend. Até isso existir, os estados desconhecidos não podem ser apresentados como coleções vazias confirmadas.
5. Verificar inserção, repetição, atualização válida/inválida, snapshot antigo, reabertura, referência conflitante e cobertura parcial em PostgreSQL e na origem homologada.

## Reprodução da validação da proposta

```powershell
npm.cmd --prefix api ci
npm.cmd --prefix api run test:thindesk-contract
```

Esse comando testa o schema e exemplos em memória. Não chama Java/MongoDB, não conecta PostgreSQL e não importa os arquivos. O conector existente não consome esse envelope. Resultados em [evidências do contrato](evidencias/contrato-thindesk.md); testes originais e sua cobertura permanecem registrados nas fases anteriores.

## Referências

- [JSON Schema — condições](https://json-schema.org/understanding-json-schema/reference/conditionals).
- [JSON Schema — strings e formatos](https://json-schema.org/understanding-json-schema/reference/string).
- [Ajv — JSON Schema 2020-12](https://ajv.js.org/json-schema.html).
- [Ajv — validação de formatos](https://ajv.js.org/packages/ajv-formats.html).
