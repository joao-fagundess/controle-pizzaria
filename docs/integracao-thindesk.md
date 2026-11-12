# Recepção do Thindesk — Fase 3

O conector implementa leitura HTTP da origem Java e preservação do último payload por identificador no PostgreSQL. Também aceita export JSON local. Não modifica o Thindesk nem promove os registros legados para os indicadores: o modelo fornecido não contém datas, prioridade, identificadores estáveis de pessoas, histórico ou considerações técnicas.

## Configuração e execução

Preparar o PostgreSQL e aplicar migrations conforme [endpoints.md](endpoints.md). Na pasta `api`, compilar com `npm.cmd run build` e preencher no `.env`:

| Variável | Uso |
| --- | --- |
| `DATABASE_URL` | Banco PostgreSQL receptor, separado do MongoDB original. |
| `THINDESK_BASE_URL` | URL da aplicação, podendo incluir seu caminho de contexto; sem credenciais, query ou fragmento. HTTP apenas para loopback; acesso remoto exige HTTPS. |
| `THINDESK_USERNAME` e `THINDESK_PASSWORD` | Login de uma conta com autorização de leitura. |
| `THINDESK_SESSION_COOKIE` | Alternativa ao login: cookie de uma sessão autenticada, somente no servidor. Se informado, dispensa usuário/senha. |

```powershell
npm.cmd run thindesk:sync
```

O cliente envia `POST <base>/login`, espera redirecionamento compatível e cookie, depois consulta `GET <base>/api/chamados`. Apenas o login usa POST; não envia criação, atualização ou exclusão de chamados. Não segue redirecionamentos da consulta e rejeita HTML, mesmo com status 200. O ciclo tem timeout de 15 segundos e a resposta JSON é limitada a 5 MiB. A listagem original não oferece paginação; exceder o limite exige revisar o contrato antes de importar, em vez de truncar silenciosamente.

Para um export autorizado, com um objeto ou uma lista:

```powershell
npm.cmd run thindesk:sync -- --file "C:\caminho\export-chamados.json"
```

Aceita `id` textual da API ou `_id` textual/`{ "$oid": "..." }` de export MongoDB. O JSON de exemplo do ZIP precisa ser extraído separadamente para usar esse comando; o conector não executa nem descompacta o projeto Java.

## Regras de recepção

1. Conferir identidade, estrutura e duplicidade da lista antes de escrever.
2. Iniciar transação e lock para serializar recepções.
3. Preservar o payload original em `ticket_source_records`, com origem `thindesk`, erros explícitos e estado `rejected` por insuficiência do contrato legado.
4. Atualizar a mesma identidade em novas observações, sem criar outro registro. `first_seen_at` é preservado; `last_seen_at` indica recebimento local.
5. Confirmar o lote ou revertê-lo integralmente em falha. Se um registro já possuir vínculo canônico, este conector legado recusa o lote: atualizar um vínculo exige uma sincronização completa ainda não suportada.

Registros sem identificador confiável são contabilizados como `unidentified` e não podem ser gravados numa tabela cuja identidade é obrigatória. Duplicidade da mesma identidade no lote causa erro, sem alterações. Não deduplicar pessoas por nome; não converter `Manutenção` automaticamente em hardware; não usar ObjectId ou instante de importação como data de criação do chamado.

Normalização de status reconhece `Aberto`/`ABERTO`, `EM_ANDAMENTO`/`Em andamento` e `CONCLUIDO`/`Concluído`. Espaços laterais, caixa e acentos são normalizados apenas nessa classificação. O payload original é preservado. Valores desconhecidos e conflito entre `tipo` e `Tipo` são registrados como erros adicionais. A normalização não libera a promoção sem os demais campos.

Campos que eventualmente apareçam em um payload novo não são interpretados como extensão oficial: é preciso aprovar e implementar um contrato complementar antes da promoção. Isso evita atribuir significado incorreto a datas ou autores com nomes semelhantes.

O [contrato complementar 1.0 aprovado](contrato-complementar-thindesk.md) define os campos e a declaração de completude. A [evolução local da origem](evolucao-local-thindesk.md) captura novos chamados e produz esse export em ambiente separado. O leitor legado não aceita o envelope como formato de importação. A validação estrutural, isoladamente, não libera registros para os indicadores; o consumidor versionado e sua validação semântica continuam pendentes.

## Relatório e códigos de saída

Exemplo de recepção de um chamado legado identificado:

```json
{ "received": 1, "preserved": 1, "rejected": 1, "unidentified": 0, "promoted": 0 }
```

`preserved` conta registros processados no lote, inclusive atualização de identidade existente. `promoted` é sempre zero nesta versão. Erros por registro ficam em `validation_errors`; o relatório de terminal não imprime nomes, descrições, notas, senhas ou cookies.

- Código 0: recepção concluída, mesmo quando os legados foram preservados como rejeitados para análise.
- Código 2: lote processado com registros sem identidade, que não puderam ser preservados.
- Código 1: falha de configuração, leitura, duplicidade ou banco. Falhas de escrita revertem o lote. Mensagens controladas são exibidas; erros internos de driver/rede não expõem endereços ou segredos.

## Limite operacional

Na Fase 3, o teste de login e leitura usou um servidor HTTP controlado que reproduzia o contrato observado. Na etapa complementar de 12/11/2026, a [homologação local](homologacao-thindesk.md) compilou o Java original do ZIP e verificou login, sessão, leitura e recepção com MongoDB em execução e dados fictícios. Não houve uso das credenciais do ZIP ou de dados reais; a instância operacional continua pendente.

Para sustentar todos os indicadores reais, a origem deve fornecer datas confiáveis, prioridade, vínculos estáveis e, para o detalhe completo, histórico e considerações. Até lá, o dashboard deve avisar que existem registros excluídos e mostrar a qualidade global devolvida pelo resumo. Polling do frontend apenas refaz consultas e não executa este comando de recepção. Nenhum agendamento automático foi criado nesta fase.
