# Recepção do export Thindesk 1.0

A recepção `1.0` lê o export do Thindesk, valida os registros e importa os chamados válidos em transação. A API e o painel informam de onde vieram os dados e se o histórico e as considerações estão completos. A captura na origem foi integrada pelo [PR #7](https://github.com/joao-fagundess/controle-pizzaria/pull/7), e o receptor pelo [PR #8](https://github.com/joao-fagundess/controle-pizzaria/pull/8). A `main` reúne essa integração; a tag `v0.1.0` preserva a primeira entrega.

## Comandos e mapeamento

`thindesk:sync:v1` é separado do receptor legado. Não há detecção automática de versão nem fallback entre formatos. O comando legado continua com `promoted: 0` e recusa um envelope versionado em arquivo. O novo comando exige um arquivo de mapeamento explícito:

```json
{"contract_version":"1.0","types":{"analytics-printing":"printing","analytics-network":"network"}}
```

Os IDs do exemplo pertencem somente à homologação fictícia. A [configuração de exemplo](../integration/thindesk/analytics-mapping.example.json) acrescenta também o tipo do exemplo de contrato parcial, usado apenas nos testes descartáveis. Não constitui mapeamento operacional. Os códigos precisam existir em `ticket_types`. Nome semelhante não cria correspondência; um ID já vinculado a um tipo local não pode ser remapeado silenciosamente. O arquivo deve cobrir o tipo atual e as referências de tipo do histórico.

```powershell
npm.cmd --prefix api ci
npm.cmd --prefix api run build
# Configurar DATABASE_URL para o banco pretendido e aplicar migrations antes da recepção.
npm.cmd --prefix api run db:migrate
npm.cmd --prefix api run thindesk:sync:v1 -- --mapping tipos.json --file export.json
# Sem --file: usa THINDESK_BASE_URL e login/sessão já configurados.
npm.cmd --prefix api run thindesk:sync:v1 -- --mapping tipos.json
```

O modo HTTP consulta exclusivamente `GET /api/v1/analytics/tickets/export`, após o login de sessão; não escreve chamados na origem. Mantém timeout de 15 segundos, limite de 5 MiB, recusa de redirects/HTML e HTTPS obrigatório fora do loopback. Arquivos são lidos com limite durante o streaming e UTF-8 estrito. O mapeamento tem o mesmo limite. Códigos de saída: `0` para lote sem rejeições/não identificados, `2` para recepção concluída com exclusões explícitas e `1` para falha com rollback ou envelope/configuração inválidos. Não interpretar `2` como ausência de promoção: o relatório informa exatamente o que foi aceito.

Na homologação, o endpoint novo está em `127.0.0.1:8082`; a aplicação original em 8081 não o expõe.

O schema de execução em `api/contracts` é comparado ao schema publicado nos testes. Ajv e ajv-formats são dependências de produção, sem coerção, defaults ou remoção de campos. A imagem Docker inclui o schema e a CLI compilada.

## Validação e atualização

1. Conferir limite, UTF-8, versão e envelope. Identidades de chamados duplicadas ou metadados contraditórios para a mesma pessoa/tipo impedem o lote.
2. Validar estrutura e semântica por chamado: cronologia, resolução, vínculos, identidades de fatos e sequências. Referências só são resolvidas por identidade de origem, usando cadastros válidos no lote ou já aceitos no banco.
3. Resolver o mapeamento explícito. Não criar pessoas por nome nem tipos por semelhança textual. Metadados de registros inválidos não são usados para liberar referências de outros candidatos.
4. Reservar uma conexão e executar a operação em transação, com o mesmo advisory lock do receptor legado. O consumidor não deve receber `pool.query` sem reservar uma conexão.
5. Promover os válidos, preservar os novos identificados inválidos como `rejected` e contabilizar os sem identidade. Atualização inválida de um chamado vinculado aborta o lote inteiro, preservando payload e chamado aceitos. Não é criado um histórico separado de cada tentativa malsucedida; o operador conserva o arquivo enviado.

NUL e surrogates Unicode isolados não podem ser preservados literalmente no JSONB do PostgreSQL: nesse caso o lote inteiro é recusado antes de qualquer escrita, sem substituir caracteres. Demais erros estruturais/semânticos de registros novos podem ser armazenados como rejeição, sem participar dos indicadores.

Versões comparam `updated_at` como instante UTC com precisão de nanossegundos. Mesmo instante com outro offset não é versão diferente. Mesmo `updated_at` com snapshot diferente é conflito. Ordenação dos objetos/coleções não altera a identidade do snapshot; IDs opacos continuam sensíveis a caixa e a composição Unicode. Precisão acima de nove casas decimais, ano zero e segundos intercalares não suportados pelo parser são recusados explicitamente.

`created_at` e os fatos aceitos são imutáveis. IDs de notas/eventos não podem ser reaproveitados para conteúdo, autoria, instante ou sequência diferentes. Os nomes/papéis atuais dos autores podem mudar com uma versão nova, sem reescrever a identidade da autoria. Uma versão nova deve incluir os fatos já aceitos; não há exclusão por omissão. Uma versão antiga pode omitir fatos posteriores, mas não contradizer fatos comuns. Ausência de chamado no lote, lote vazio ou coleções vazias não autorizam deletar dados.

Uma observação antiga atualiza apenas `last_seen_at`. A versão aceita do payload e o cadastro não regridem. A repetição idêntica não duplica chamados, pessoas, notas ou eventos. Novas informações de cadastro usam a maior versão aceita que as declarou; conflitos com metadados mais recentes bloqueiam o lote. Alteração de papel não pode deixar outro chamado atribuído a pessoa que deixou de ser técnico.

Histórico completo exige criação única na sequência 1 e no instante original, sequência contígua, valores anteriores coerentes, ordem temporal e estado/resolução finais compatíveis. Eventos no mesmo instante são ordenados pela sequência. Histórico parcial pode conter lacunas e não comprova transições ausentes; continua visivelmente parcial. Reabertura limpa a resolução atual e mantém fatos antigos; nova resolução não duplica o chamado nos indicadores.

O payload aceito mantém as strings de timestamp recebidas. O PostgreSQL armazena os instantes de consulta com truncamento explícito para microssegundos; a API existente continua apresentando ISO em milissegundos. O controle de versão e a comparação de fatos usam o payload preservado em nanossegundos. Notas guardam também o instante original numérico para escolher a última e ordenar o detalhe sem perder diferenças inferiores a um microssegundo. Empates exatos usam identidade externa estável. Hora de importação não substitui data de negócio.

## Migration e consulta

A migration `003_analytics_source.sql` acrescenta cobertura/título derivado/versão e export aceito em `tickets`, identidade e sequência externas dos fatos, mapeamentos de tipo e versões de cadastro. Não modifica `001`/`002`. Índices únicos impedem duplicar IDs de notas/eventos ou sequências por chamado. Arquivos SQL têm LF fixo para evitar divergência de checksum entre Windows e Linux.

A migration incremental `004_note_source_precision.sql` conserva a precisão das notas e seu índice de ordenação. Para notas já aceitas pela versão anterior, recupera os nanossegundos somente quando existem no payload preservado; não inventa precisão para notas antigas. `003`, já aplicada na primeira atualização local desta versão, foi preservada. O teste de regressão força UUIDs locais na ordem oposta à cronologia para comprovar que a última nota usa o instante correto.

Registros anteriores sem declaração de completude ficam `unavailable`; coleções que já têm fatos ficam `partial`. Os dados gerados integralmente pelo seed de demonstração são `complete`. A migration foi testada sobre a estrutura anterior com dados existentes, sem perder seus IDs/fatos.

A API mantém os sete endpoints e acrescenta `ticket.provenance` com `contract_version`, `exported_at`, `title_is_derived`, `history_coverage` e `technical_notes_coverage`. Histórico acrescenta `sequence`, nula nos registros antigos. O detalhe usa essa sequência antes do desempate temporal/local. Movimentos de tipo/responsável referenciam IDs canônicos para a apresentação pelo catálogo da interface.

Tabela e detalhe distinguem ausência confirmada de dados não fornecidos. Notas completas vazias mostram “Sem considerações técnicas”; coleções indisponíveis mostram “Não fornecido pela origem”; coleções parciais têm aviso. Título derivado e data da exportação aceita aparecem próximos aos dados. Metadados ausentes em uma resposta antiga não permitem afirmar ausência. Texto continua sendo renderizado como conteúdo literal pelo React.

## Homologação local

O export efetivo da origem contém seis chamados novos. Três possuem histórico referenciando `analytics-tech-01`, mas não trazem seu cadastro em nenhuma posição do lote. Sem cadastro anteriormente aceito, esses três continuam rejeitados. Os outros três são promovidos. Não foi inventado nome, técnico, data, nota ou evento para fazer todos os registros passarem. Um produtor futuro deve fornecer dados corroborados dessas identidades; um cadastro aceito em snapshot anterior também pode resolver a referência.

Para atualizar o receptor fictício de homologação, depois de compilar e validar a revisão:

```powershell
docker compose --env-file .cache/thindesk-homologation/.env -f docker-compose.thindesk-analytics.yml up --no-build -d --wait --wait-timeout 360
node scripts/export-thindesk-analytics.mjs
docker compose --env-file .cache/thindesk-homologation/.env -f docker-compose.thindesk.yml build api web
docker compose --env-file .cache/thindesk-homologation/.env -f docker-compose.thindesk.yml run --rm migrate
docker compose --env-file .cache/thindesk-homologation/.env -f docker-compose.thindesk.yml up -d --wait api web
docker compose --env-file .cache/thindesk-homologation/.env -f docker-compose.thindesk.yml --profile tools run --rm sync-v1
```

O último comando retorna `2` com **três promoções e três rejeições novas** na primeira execução. Somadas às três rejeições legadas já preservadas, o dashboard em `http://127.0.0.1:8180/` passa a ter três chamados canônicos e seis rejeitados. Repetir o comando não aumenta a contagem. A origem analítica pode então ser parada para liberar RAM; seu volume e o arquivo baixado permanecem preservados. A demonstração em `8080` continua com 480 chamados. Não carregar o seed nesse receptor, não usar `down -v` e não substituir o ZIP original.

As evidências distinguem o banco nativo descartável (480 demonstrações mais três promoções), o Compose descartável (também exercita o exemplo parcial) e o receptor persistente de homologação (somente os três chamados promovidos). Procedimento, resultados e limitações em [evidências desta versão](evidencias/thindesk-import.md). Instância operacional, autenticação corporativa, HTTPS e carga representativa continuam pendentes; esta validação usa somente dados fictícios locais.
