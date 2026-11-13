# feat: receber o export Thindesk 1.0 e apresentar completude no painel

O receptor legado mantinha todos os chamados fora dos indicadores. A recepção explícita `thindesk:sync:v1` passa a validar o contrato e a semântica, resolver identidades/mapeamentos e promover snapshots confiáveis em transação. Atualização inválida vinculada reverte o lote; observações antigas e repetições preservam a versão aceita. Os fatos externos são imutáveis e idempotentes por chamado.

As migrations incrementais acrescentam proveniência, cobertura, identidades/sequências, versões de cadastro e precisão original das notas. A API acrescenta metadados e a UI distingue coleções completas, parciais e indisponíveis, além de identificar título derivado. A CLI legada continua sem promoção e recusa envelopes versionados. A imagem de produção contém o schema e suas dependências de execução.

A homologação lê as duas instâncias Java reais sem escrever na origem. Do export de seis chamados, três são promovidos; três continuam rejeitados porque o histórico referencia um técnico sem cadastro resolvido. Não há associação por nome nem preenchimento retroativo. O receptor local preserva os rejeitados legados e a primeira entrega permanece em `main`/`v0.1.0`.

Validação: testes de migração sobre dados existentes; regras e regressão em PostgreSQL embarcado/nativo; CLI compilada por HTTP/arquivo; resolução/reabertura; conflitos e rollback; metadados sem regressão; Unicode/UTF-8; estados de completude no frontend; imagem de produção com Compose e consultas HTTP. Os números e o estado final dos ambientes estão nas evidências.

- [Regras e operação](../recepcao-versionada-thindesk.md).
- [Evidências](../evidencias/thindesk-import.md).
- [PostgreSQL nativo](../evidencias/thindesk-import/native/postgres-report.json) e [leitura das origens reais](../evidencias/thindesk-import/source-pipeline.json).
- [Imagem de produção](../evidencias/thindesk-import/compose/compose-report.json).
