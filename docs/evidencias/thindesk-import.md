# Evidências da recepção Thindesk 1.0

Etapa autorizada em 13/11/2026 após integrar o PR #7. A recepção foi verificada com dados fictícios, sem usar credenciais do ZIP nem alterar registros no Java/MongoDB. O estado persistente de homologação passou a **três chamados aceitos e seis rejeitados preservados**. A demonstração principal mantém 480 chamados.

## Resultados locais

| Verificação | Resultado e evidência |
| --- | --- |
| PostgreSQL nativo por TCP | **108 testes de API/conector/migration/CLI**, **14 de integridade** e **13 verificações HTTP**: [relatório](thindesk-import/native/postgres-report.json), [testes](thindesk-import/native/postgres-tests.json), [TAP](thindesk-import/native/postgres-integrity.tap). |
| Origem Java real → CLIs → PostgreSQL | [Execução própria](thindesk-import/source-pipeline.json), anterior ao ajuste incremental de precisão: legado com três rejeitados/zero promovidos; export `1.0` com seis recebidos, três promovidos/três rejeitados por referência histórica não resolvida. O banco descartável tinha 480 demonstrações; API confirmou total 483, três vinculados e seis rejeitados. A revisão final foi novamente verificada com o arquivo real baixado da origem. |
| Interface | **25 testes aprovados**, incluindo desconhecimento, parcialidade e título derivado. Capturas reais do receptor atualizado: [indicadores](thindesk-import/dashboard.jpg) e [detalhe/proveniência](thindesk-import/detail.jpg). |
| Imagem de produção | **27 verificações HTTP**, mais **cinco grupos de integração** e **seis execuções da CLI** no container: [relatório](thindesk-import/compose/compose-report.json). Inclui exemplo parcial em ambiente descartável, repetição, atualização, observação antiga e rollback. Recursos/volumes temporários foram removidos. |
| Receptor persistente | [Relatório final](thindesk-import/homologation.json), [execução](thindesk-import/homologation.txt): migrations 003/004, imagens iguais às verificadas no Compose, repetição idempotente e legados preservados por hash. A [primeira promoção](thindesk-import/homologation-first.json), antes da migration de precisão, foi preservada separadamente. |

O esquema estrutural mantém seus 44 casos próprios. Os cenários de CLI compilada são exclusivos da execução por TCP e ficam explicitamente ignorados no modo embarcado, que não oferece conexão para outro processo. A CI repete as suítes consolidadas em banco embarcado e nativo, os testes do schema e o Compose de produção. A leitura das duas instâncias Java reais é local e opt-in; a CI não recebe o ZIP, as credenciais ou os volumes de homologação.

## Garantias exercitadas

Os testes cobrem resolução/fechamento/reabertura, fatos imutáveis, duplicidade por ID e sequência, referências ausentes, transições incoerentes, cronologia, versão antiga, mesma versão conflitante, atualização de cadastros sem regressão, troca de papel incompatível, homônimos e rollback de lote. Incluem precisão de nanossegundos, offsets equivalentes, notas com IDs Unicode distintos, UTF-8 inválido, NUL/surrogates isolados, limites de tamanho e recusa do envelope no comando legado. A migration foi aplicada sobre dados da estrutura anterior, sem perder IDs/fatos e sem editar migrations antigas.

A revisão final conserva a ordem de notas separadas por nanossegundos dentro do mesmo microssegundo. O teste usa UUIDs locais em ordem contrária e verifica tanto a última consideração quanto a lista cronológica. A migration 004 recupera apenas a precisão presente nos payloads aceitos e deixa as notas antigas sem essa evidência com valor nulo.

O contrato completo foi validado antes de promover dados. Os três históricos que dependem de `analytics-tech-01` continuam rejeitados porque o export não fornece seu cadastro e não havia identidade aceita para resolvê-lo. Não foram associados a outra pessoa pelo nome. Os três registros legados também continuam rejeitados. O arquivo enviado permanece no cache ignorado e seus hashes são registrados; não há auditoria separada de cada tentativa inválida.

## Estado final e reprodução

O [dashboard de homologação](http://127.0.0.1:8180/) foi conferido no navegador: total três, um aberto, dois fechados, taxa 66,7%, aviso de seis exclusões, detalhe com exportação aceita, autoria e ausência confirmada de notas completas. A migração permite consultar dados parciais/indisponíveis com rótulos próprios, também verificados em testes de frontend e no Compose descartável.

Os oito serviços anteriores deste projeto estão saudáveis; o receptor usa a revisão nova. A origem analítica em 8082 foi encerrada para liberar RAM, preservando imagem/volume. O ZIP conserva seu SHA-256 e os 29 arquivos originais foram verificados. Containers dos outros projetos não foram alterados.

Reprodução das regras, comandos e limitações em [recepção versionada](../recepcao-versionada-thindesk.md). Para repetir a validação nativa com leitura das origens já iniciadas, executar `npm.cmd --prefix api run build` e definir `ANALYTICS_EVIDENCE=1` e `THINDESK_HOMOLOGATION=1` somente no processo de `npm.cmd --prefix api run test:postgres`. Sem o segundo flag, a suíte usa exclusivamente suas origens HTTP fictícias de teste. Para os testes de imagem, definir `ANALYTICS_EVIDENCE=1` e executar `node scripts/validate-compose.mjs`; a atualização persistente usa `node scripts/validate-thindesk-import.mjs` após baixar o export e verificar a imagem.
